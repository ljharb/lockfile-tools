/*
This rule detects when multiple packages in the lockfile provide command-line binaries with the same name.

When multiple packages export the same binary name, the behavior is non-deterministic across package managers:
- npm: First package installed wins (non-deterministic due to race conditions)
- pnpm: Warns about conflicts and shows which package is being used
- Yarn: One overwrites the other (non-deterministic)
- Bun: Behavior not well-documented

This rule helps catch these conflicts before they cause issues.

This rule uses pacote to fetch package manifests without requiring node_modules to be installed.
*/

import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';
import pacote from 'pacote';
import { PACKAGE_MANAGERS } from 'lockfile-tools/package-managers';
import { loadBunLockbContent, findJsonKeyLine } from 'lockfile-tools/io';
import { extractPackageName } from 'lockfile-tools/npm';
import { parseYarnLockfile, createLockfileExtractor } from 'lockfile-tools/parsers';
import { hasLockfile, buildVirtualLockfile } from 'lockfile-tools/virtual';

const { values, entries } = Object;

/** @typedef {import('lockfile-tools/lib/package-managers.d.mts').Lockfile} Lockfile */

/**
 * @typedef {Object} PackageBinInfo
 * @property {string} name - Package name
 * @property {string} version - Package version
 * @property {Record<string, string>} bins - Binary name -> script path mapping
 * @property {boolean} isDirect - Whether this is a direct dependency
 * @property {number} line - Line number in lockfile where package appears
 */

/**
 * Fetch package manifest and extract bin information
 * @type {(packageName: string, version: string) => Promise<Record<string, string> | null>}
 */
async function fetchPackageBins(packageName, version) {
	try {
		const manifest = await pacote.manifest(`${packageName}@${version}`, {
			preferOnline: false, // Use cache if available
			fullMetadata: false, // We only need basic fields
		});

		if (!manifest.bin) {
			return null;
		}

		// bin can be a string or an object
		if (typeof manifest.bin === 'string') {
			// Single binary with the package name
			return { [packageName]: manifest.bin };
		}

		if (typeof manifest.bin === 'object' && manifest.bin !== null) {
			return manifest.bin;
		}

		return null;
	} catch {
		// Package not found or network error
		return null;
	}
}

/**
 * Get direct dependencies from package.json
 * @type {(dir: string) => Set<string>}
 */
function getDirectDependencies(dir) {
	/** @type {Set<string>} */
	const directDeps = new Set();
	try {
		const rootPkgPath = join(dir, 'package.json');
		if (existsSync(rootPkgPath)) {
			const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf8'));
			if (rootPkg.dependencies) {
				Object.keys(rootPkg.dependencies).forEach((dep) => directDeps.add(dep));
			}
			if (rootPkg.devDependencies) {
				Object.keys(rootPkg.devDependencies).forEach((dep) => directDeps.add(dep));
			}
		}
	} catch {
		// Ignore errors reading root package.json
	}
	return directDeps;
}

/** @type {(content: string, dir: string) => Promise<PackageBinInfo[]>} */
async function extractPackageBinsFromNpmLockfile(content, dir) {
	/** @type {PackageBinInfo[]} */
	const packages = [];
	const parsed = JSON.parse(content);
	const directDeps = getDirectDependencies(dir);

	// Check packages (lockfile v2/v3)
	if (parsed.packages) {
		const binPromises = entries(parsed.packages).map(async ([key, pkg]) => {
			if (key === '') {
				return null;
			}
			// Skip workspace symlinks (link: true means it's a local workspace package)
			if (pkg.link) {
				return null;
			}
			const packageName = extractPackageName(key);
			const bins = await fetchPackageBins(packageName, pkg.version);
			if (bins) {
				return {
					name: packageName,
					version: pkg.version || 'unknown',
					bins,
					isDirect: directDeps.has(packageName),
					line: findJsonKeyLine(content, key),
				};
			}
			return null;
		});

		const results = await Promise.all(binPromises);
		packages.push(...results.filter((p) => p !== null));
	}

	// Check dependencies (lockfile v1)
	if (parsed.dependencies) {
		/** @type {(deps: Record<string, {version: string; dependencies?: Record<string, unknown> }>, prefix?: string) => Promise<void>} */
		const collectDeps = async (deps, prefix = '') => {
			const binPromises = entries(deps).map(async ([name, dep]) => {
				const fullName = prefix ? `${prefix}/${name}` : name;
				const packageName = name.includes('/') ? name.split('/').pop() : name;
				/* istanbul ignore next - defensive: packageName is only falsy for names ending in '/' */
				const bins = await fetchPackageBins(packageName || '', dep.version);
				if (bins) {
					return {
						name: fullName,
						version: dep.version || 'unknown',
						bins,
						/* istanbul ignore next - defensive: packageName is only falsy for names ending in '/' */
						isDirect: directDeps.has(packageName || ''),
						line: findJsonKeyLine(content, name),
					};
				}
				return null;
			});

			const results = await Promise.all(binPromises);
			packages.push(...results.filter((p) => p !== null));

			// Recursively process nested dependencies
			await Promise.all(entries(deps).map(async ([name, dep]) => {
				if (dep.dependencies) {
					const fullName = prefix ? `${prefix}/${name}` : name;
					await collectDeps(
						/** @type {Record<string, {version: string; dependencies?: Record<string, unknown> }>} */ (dep.dependencies),
						fullName,
					);
				}
			}));
		};

		await collectDeps(parsed.dependencies);
	}

	return packages;
}

/** @type {(content: string, dir: string) => Promise<PackageBinInfo[]>} */
async function extractPackageBinsFromYarnLockfile(content, dir) {
	const directDeps = getDirectDependencies(dir);
	const parsedEntries = parseYarnLockfile(content, ['version']);

	const packageList = parsedEntries.map(({
		name,
		otherFields,
		line,
	}) => {
		const nameMatch = name.match(/^(@?[^@]+)/);
		const pkgName = nameMatch ? nameMatch[1] : name;
		return {
			name: pkgName,
			version: (otherFields && otherFields.version) || 'unknown',
			line,
		};
	});

	// Fetch all package bins
	const binPromises = packageList.map(async ({
		name,
		version,
		line,
	}) => {
		const bins = await fetchPackageBins(name, version);
		if (bins) {
			return {
				name,
				version,
				bins,
				isDirect: directDeps.has(name),
				line,
			};
		}
		return null;
	});

	const results = await Promise.all(binPromises);
	return results.filter((p) => p !== null);
}

/** @type {(content: string, dir: string) => Promise<PackageBinInfo[]>} */
async function extractPackageBinsFromPnpmLockfile(content, dir) {
	/** @type {PackageBinInfo[]} */
	const packages = [];
	const lines = content.split('\n');
	const directDeps = getDirectDependencies(dir);

	let inPackages = false;
	/** @type {{key: string, name: string, version: string, line: number}[]} */
	const packageList = [];
	/** @type {string | null} */
	let currentPackage = null;
	/** @type {number} */
	let currentPackageLine = 0;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		if (line.startsWith('packages:')) {
			inPackages = true;
		} else if (inPackages) {
			if (line.match(/^ {2}\S/) && line.includes(':')) {
				if (currentPackage) {
					const nameMatch = currentPackage.match(/^(@?[^@]+)/);
					/* istanbul ignore next - tested via esmock; defensive: only falsy for malformed pnpm keys */
					const pkgName = nameMatch ? nameMatch[1] : currentPackage;
					const versionMatch = currentPackage.match(/@([^@]+)$/);
					packageList.push({
						key: currentPackage,
						name: pkgName,
						version: versionMatch ? versionMatch[1] : 'unknown',
						line: currentPackageLine,
					});
				}
				currentPackage = line.split(':')[0].trim().replace(/['"]/g, '');
				currentPackageLine = i + 1; // 1-indexed
			}
		}
	}

	if (currentPackage) {
		const nameMatch = currentPackage.match(/^(@?[^@]+)/);
		/* istanbul ignore next - tested via esmock; defensive: only falsy for malformed pnpm keys */
		const pkgName = nameMatch ? nameMatch[1] : currentPackage;
		const versionMatch = currentPackage.match(/@([^@]+)$/);
		packageList.push({
			key: currentPackage,
			name: pkgName,
			version: versionMatch ? versionMatch[1] : 'unknown',
			line: currentPackageLine,
		});
	}

	// Fetch all package bins
	const binPromises = packageList.map(async ({
		key,
		name,
		version,
		line,
	}) => {
		const bins = await fetchPackageBins(name, version);
		if (bins) {
			return {
				name: key,
				version,
				bins,
				isDirect: directDeps.has(name),
				line,
			};
		}
		return null;
	});

	const results = await Promise.all(binPromises);
	packages.push(...results.filter((p) => p !== null));

	return packages;
}

/** @type {(_content: string, _dir: string) => Promise<PackageBinInfo[]>} */
// eslint-disable-next-line no-unused-vars
async function extractPackageBinsFromBunLockfile(_content, _dir) {
	// bun.lock (text format) - doesn't store version information in a parseable way
	// For now, return empty array
	return [];
}

/** @type {(filepath: string, dir: string) => Promise<PackageBinInfo[]>} */
async function extractPackageBinsFromBunLockbBinary(filepath, dir) {
	const yarnLockContent = loadBunLockbContent(filepath);
	if (!yarnLockContent) {
		return [];
	}
	return extractPackageBinsFromYarnLockfile(yarnLockContent, dir);
}

/** @type {(content: string, dir: string) => Promise<PackageBinInfo[]>} */
async function extractPackageBinsFromVltLockfile(content, dir) {
	/** @type {PackageBinInfo[]} */
	const packages = [];
	const parsed = JSON.parse(content);
	const directDeps = getDirectDependencies(dir);

	// vlt format: nodes object with arrays [version, name, integrity]
	if (parsed.nodes) {
		const binPromises = entries(parsed.nodes).map(async ([key, node]) => {
			if (Array.isArray(node) && node.length >= 2) {
				const [version, name] = node;
				const bins = await fetchPackageBins(name, String(version));
				if (bins) {
					return {
						name: key,
						version: String(version),
						bins,
						isDirect: directDeps.has(name),
						line: findJsonKeyLine(content, key),
					};
				}
			}
			return null;
		});

		const results = await Promise.all(binPromises);
		packages.push(...results.filter((p) => p !== null));
	}

	return packages;
}

/** @type {{ [k in Lockfile]: (s: string, d: string) => Promise<PackageBinInfo[]> }} */
const extracts = {
	// @ts-expect-error TS doesn't understand dunder proto
	__proto__: null,
	'package-lock.json': extractPackageBinsFromNpmLockfile,
	'npm-shrinkwrap.json': extractPackageBinsFromNpmLockfile,
	'yarn.lock': extractPackageBinsFromYarnLockfile,
	'pnpm-lock.yaml': extractPackageBinsFromPnpmLockfile,
	'bun.lock': extractPackageBinsFromBunLockfile,
	'bun.lockb': extractPackageBinsFromBunLockfile,
	'vlt-lock.json': extractPackageBinsFromVltLockfile,
};

/** @type {(filepath: string, dir: string) => Promise<PackageBinInfo[]>} */
const extractPackageBinsFromLockfile = createLockfileExtractor(
	extracts,
	/** @type {(filepath: string, ...args: unknown[]) => Promise<PackageBinInfo[]>} */ (extractPackageBinsFromBunLockbBinary),
);

/**
 * Extract package bins from virtual lockfile packages
 * @type {(virtualPackages: import('lockfile-tools/virtual').VirtualPackageInfo[]) => Promise<PackageBinInfo[]>}
 */
async function extractPackageBinsFromVirtual(virtualPackages) {
	/** @type {PackageBinInfo[]} */
	const packages = [];

	// Fetch bins for each package
	const binPromises = virtualPackages.map(async ({
		name,
		version,
		isDirect,
	}) => {
		const bins = await fetchPackageBins(name, version);
		if (bins) {
			return {
				name,
				version,
				bins,
				isDirect,
				line: 0, // Virtual lockfile has no file, so no line number
			};
		}
		return null;
	});

	const results = await Promise.all(binPromises);
	packages.push(...results.filter((p) => p !== null));

	return packages;
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
	meta: {
		type: 'problem',
		docs: {
			description: 'detect binary name conflicts between packages',
			category: 'Possible Errors',
			recommended: true,
			url: 'https://github.com/ljharb/lockfile-tools/blob/HEAD/packages/eslint-plugin/docs/rules/binary-conflicts.md',
		},
		schema: [],
		messages: {
			binaryConflict: 'Binary name conflict: "{{binary}}" is provided by multiple packages: {{packages}}',
			binaryConflictWithPreference: 'Binary name conflict: "{{binary}}" is provided by {{count}} packages. Currently active: {{active}} ({{reason}}). Also provided by: {{others}}',
			malformedLockfile: 'Lockfile "{{filename}}" is malformed: {{error}}',
		},
	},

	create(context) {
		/** @type {Lockfile[]} */
		const lockfiles = values(PACKAGE_MANAGERS).flatMap((pm) => pm.lockfiles);

		return {
			async Program(node) {
				// Use context.filename if available (ESLint 8.40+), fall back to getFilename() for older versions
				const filename = context.filename ?? context.getFilename();
				const dir = dirname(filename);

				// Check if any lockfile exists
				const lockfileExists = hasLockfile(dir);

				// If no lockfile exists, use virtual lockfile from arborist
				if (!lockfileExists) {
					const virtualPackages = await buildVirtualLockfile(dir);
					const packages = await extractPackageBinsFromVirtual(virtualPackages);

					// Build a map of binary names to packages that provide them
					/** @type {Map<string, PackageBinInfo[]>} */
					const binMap = new Map();

					packages.forEach((pkg) => {
						entries(pkg.bins).forEach(([binName]) => {
							if (!binMap.has(binName)) {
								binMap.set(binName, []);
							}
							binMap.get(binName)?.push(pkg);
						});
					});

					// Report conflicts
					binMap.forEach((providers, binName) => {
						if (providers.length > 1) {
							// Check if there's a clear preference (direct dependency)
							const directProviders = providers.filter((p) => p.isDirect);
							// Use the first provider's line number for the error location (0 for virtual)
							const firstLine = providers[0].line;
							/** @type {import('eslint').AST.SourceLocation | undefined} */
							/* istanbul ignore next - tested via esmock; truthy branch requires binary conflict in real lockfile */
							const loc = firstLine ? { start: { line: firstLine, column: 0 }, end: { line: firstLine, column: 0 } } : undefined;

							if (directProviders.length === 1) {
								// One direct dependency provides it
								const [active] = directProviders;
								const others = providers
									.filter((p) => p !== active)
									.map((p) => `${p.name}@${p.version}`)
									.join(', ');

								context.report({
									node,
									loc,
									messageId: 'binaryConflictWithPreference',
									data: {
										binary: binName,
										count: String(providers.length),
										active: `${active.name}@${active.version}`,
										reason: 'direct dependency',
										others,
									},
								});
							} else {
								// No clear preference or multiple direct dependencies
								const packageList = providers
									.map((p) => `${p.name}@${p.version}`)
									.join(', ');

								context.report({
									node,
									loc,
									messageId: 'binaryConflict',
									data: {
										binary: binName,
										packages: packageList,
									},
								});
							}
						}
					});

					return;
				}

				// Process lockfiles sequentially to ensure proper error handling
				for (let li = 0; li < lockfiles.length; li++) { // eslint-disable-line no-restricted-syntax
					const lockfileName = lockfiles[li];
					const lockfilePath = join(dir, lockfileName);

					/** @type {PackageBinInfo[]} */
					let packages;
					try {
						// eslint-disable-next-line no-await-in-loop
						packages = await extractPackageBinsFromLockfile(lockfilePath, dir);
					} catch (e) {
						context.report({
							node,
							messageId: 'malformedLockfile',
							data: {
								filename: lockfileName,
								error: e instanceof Error ? e.message : String(e),
							},
						});
						// eslint-disable-next-line no-continue, no-restricted-syntax
						continue;
					}

					// Build a map of binary names to packages that provide them
					/** @type {Map<string, PackageBinInfo[]>} */
					const binMap = new Map();

					packages.forEach((pkg) => {
						entries(pkg.bins).forEach(([binName]) => {
							if (!binMap.has(binName)) {
								binMap.set(binName, []);
							}
							binMap.get(binName)?.push(pkg);
						});
					});

					// Report conflicts
					binMap.forEach((providers, binName) => {
						if (providers.length > 1) {
							// Check if there's a clear preference (direct dependency)
							const directProviders = providers.filter((p) => p.isDirect);
							// Use the first provider's line number for the error location
							const firstLine = providers[0].line;
							/** @type {import('eslint').AST.SourceLocation | undefined} */
							const loc = firstLine ? { start: { line: firstLine, column: 0 }, end: { line: firstLine, column: 0 } } : undefined;

							if (directProviders.length === 1) {
								// One direct dependency provides it
								const [active] = directProviders;
								const others = providers
									.filter((p) => p !== active)
									.map((p) => `${p.name}@${p.version}`)
									.join(', ');

								context.report({
									node,
									loc,
									messageId: 'binaryConflictWithPreference',
									data: {
										binary: binName,
										count: String(providers.length),
										active: `${active.name}@${active.version}`,
										reason: 'direct dependency',
										others,
									},
								});
							} else {
								// No clear preference or multiple direct dependencies
								const packageList = providers
									.map((p) => `${p.name}@${p.version}`)
									.join(', ');

								context.report({
									node,
									loc,
									messageId: 'binaryConflict',
									data: {
										binary: binName,
										packages: packageList,
									},
								});
							}
						}
					});
				}
			},
		};
	},
};
