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
import npa from 'npm-package-arg';
import { minimatch } from 'minimatch';
import { PACKAGE_MANAGERS } from 'lockfile-tools/package-managers';
import { getManifest } from '../manifest-cache.mjs';
import { loadLockfileContent, loadBunLockbContent } from 'lockfile-tools/io';
import { extractPackageName, traverseDependenciesAST, forEachNpmPackagesMember } from 'lockfile-tools/npm';
import { parseYarnLockfile, createLockfileExtractor } from 'lockfile-tools/parsers';
import { hasLockfile, buildVirtualLockfile } from 'lockfile-tools/virtual';
import {
	parseJSON,
	getRootObject,
	getMember,
	getStringMember,
	forEachMember,
	nodeLine,
} from 'lockfile-tools/json-ast';
import { makeLockfileContentLoader } from '../utils.mjs';

const { values, entries } = Object;
const { parse } = JSON;

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
 * Returns the host portion of a non-registry spec, or null if it can't be
 * extracted. Used to honor a host allowlist for git/remote specs without
 * blocking ordinary registry traffic.
 * @type {(parsed: import('npm-package-arg').Result) => string | null}
 */
function getSpecHost(parsed) {
	if (parsed.type === 'git') {
		const { hosted } = /** @type {{ hosted?: { domain?: string } }} */ (parsed);
		if (hosted && typeof hosted.domain === 'string') {
			return hosted.domain;
		}
		try {
			return new URL(parsed.rawSpec.replace(/^git\+/, '')).host || null;
		} catch {
			return null;
		}
	}
	if (parsed.type === 'remote') {
		try {
			return new URL(/** @type {string} */ (parsed.fetchSpec)).host || null;
		} catch {
			return null;
		}
	}
	return null;
}

/**
 * Returns true if `version` is safe to forward to pacote under the given
 * allowlist policy:
 * - `allowedHosts === null` → no gating (default; pacote sees every spec).
 * - registry-style specs (version/range/tag/alias) always pass — those go
 *   to the configured npm registry, not a lockfile-controlled host.
 * - git/remote specs must have a host listed in `allowedHosts`.
 * - file/directory specs must match a `file:<glob>` entry in `allowedHosts`
 *   (matched against the path portion of `rawSpec` via minimatch).
 * - anything unparseable is rejected.
 * @type {(version: string, allowedHosts: readonly string[] | null) => boolean}
 */
function isAllowedSpec(version, allowedHosts) {
	if (allowedHosts === null) {
		return true;
	}
	try {
		const parsed = npa.resolve('x', version);
		if (parsed.type === 'version' || parsed.type === 'range' || parsed.type === 'tag') {
			return true;
		}
		if (parsed.type === 'alias') {
			const sub = /** @type {{ subSpec?: { rawSpec: string } }} */ (parsed).subSpec;
			return !!sub && isAllowedSpec(sub.rawSpec, allowedHosts);
		}
		if (parsed.type === 'git' || parsed.type === 'remote') {
			const host = getSpecHost(parsed);
			return !!host && allowedHosts.includes(host);
		}
		if (parsed.type === 'file' || parsed.type === 'directory') {
			// npa only recognizes `file:` as the input prefix; `type` is then
			// refined to `file`/`directory` based on the path itself. So
			// `allowedHosts` entries use a single `file:` prefix and the glob
			// portion is matched against the rawSpec's path.
			if (!parsed.rawSpec.startsWith('file:')) {
				return false;
			}
			const path = parsed.rawSpec.slice('file:'.length);
			return allowedHosts.some((entry) => {
				if (!entry.startsWith('file:')) {
					return false;
				}
				return minimatch(path, entry.slice('file:'.length));
			});
		}
		return false;
	} catch {
		return false;
	}
}

/**
 * Fetch package manifest and extract bin information
 * @type {(packageName: string, version: string, allowedHosts: readonly string[] | null) => Promise<Record<string, string> | null>}
 */
async function fetchPackageBins(packageName, version, allowedHosts) {
	if (!isAllowedSpec(version, allowedHosts)) {
		return null;
	}
	try {
		const manifest = await getManifest(`${packageName}@${version}`);

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
			const rootPkg = parse(readFileSync(rootPkgPath, 'utf8'));
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

/** @type {(content: string, dir: string, allowedHosts: readonly string[] | null) => Promise<PackageBinInfo[]>} */
async function extractPackageBinsFromNpmLockfile(content, dir, allowedHosts) {
	const root = getRootObject(parseJSON(content));
	const directDeps = getDirectDependencies(dir);

	/** @type {{ member: { value: object, loc: { start: { line: number } } }, packageName: string, name: string, version: string }[]} */
	const candidates = [];

	forEachNpmPackagesMember(getMember(root, 'packages'), (member, key) => {
		const packageName = extractPackageName(key);
		candidates.push({
			member,
			packageName,
			name: packageName,
			version: getStringMember(member.value, 'version') || 'unknown',
		});
	});

	traverseDependenciesAST(getMember(root, 'dependencies'), (member, fullName) => {
		const packageName = fullName.includes('/') ? /** @type {string} */ (fullName.split('/').pop()) : fullName;
		candidates.push({
			member,
			packageName,
			name: fullName,
			version: getStringMember(member.value, 'version') || 'unknown',
		});
	});

	const results = await Promise.all(candidates.map(async ({
		member, packageName, name, version,
	}) => {
		const bins = await fetchPackageBins(packageName, version, allowedHosts);
		if (bins) {
			return {
				name,
				version,
				bins,
				isDirect: directDeps.has(packageName),
				line: nodeLine(member),
			};
		}
		return null;
	}));
	return results.filter((p) => p !== null);
}

/** @type {(content: string, dir: string, allowedHosts: readonly string[] | null) => Promise<PackageBinInfo[]>} */
async function extractPackageBinsFromYarnLockfile(content, dir, allowedHosts) {
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
		const bins = await fetchPackageBins(name, version, allowedHosts);
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

/** @type {(content: string, dir: string, allowedHosts: readonly string[] | null) => Promise<PackageBinInfo[]>} */
async function extractPackageBinsFromPnpmLockfile(content, dir, allowedHosts) {
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
		const bins = await fetchPackageBins(name, version, allowedHosts);
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

/** @type {(_content: string, _dir: string, _allowedHosts: readonly string[] | null) => Promise<PackageBinInfo[]>} */
// eslint-disable-next-line no-unused-vars
async function extractPackageBinsFromBunLockfile(_content, _dir, _allowedHosts) {
	// bun.lock (text format) - doesn't store version information in a parseable way
	// For now, return empty array
	return [];
}

/** @type {(filepath: string, dir: string, allowedHosts: readonly string[] | null) => Promise<PackageBinInfo[]>} */
async function extractPackageBinsFromBunLockbBinary(filepath, dir, allowedHosts) {
	const yarnLockContent = loadBunLockbContent(filepath);
	if (!yarnLockContent) {
		return [];
	}
	return extractPackageBinsFromYarnLockfile(yarnLockContent, dir, allowedHosts);
}

/** @type {(content: string, dir: string, allowedHosts: readonly string[] | null) => Promise<PackageBinInfo[]>} */
async function extractPackageBinsFromVltLockfile(content, dir, allowedHosts) {
	const root = getRootObject(parseJSON(content));
	const directDeps = getDirectDependencies(dir);

	/** @type {{ member: { value: object, loc: { start: { line: number } } }, key: string, name: string, version: string }[]} */
	const candidates = [];

	// vlt format: nodes object with arrays [version, name, integrity]
	forEachMember(getMember(root, 'nodes'), (member, key) => {
		if (member.value.type !== 'Array' || member.value.elements.length < 2) {
			return;
		}
		const [versionEl, nameEl] = member.value.elements;
		const version = versionEl.value.type === 'Number'
			? String(versionEl.value.value)
			: (versionEl.value.type === 'String' ? versionEl.value.value : '');
		const name = nameEl.value.type === 'String' ? nameEl.value.value : '';
		candidates.push({
			member, key, name, version,
		});
	});

	const results = await Promise.all(candidates.map(async ({
		member, key, name, version,
	}) => {
		const bins = await fetchPackageBins(name, version, allowedHosts);
		if (bins) {
			return {
				name: key,
				version,
				bins,
				isDirect: directDeps.has(name),
				line: nodeLine(member),
			};
		}
		return null;
	}));
	return results.filter((p) => p !== null);
}

/** @type {{ [k in Lockfile]: (s: string, d: string, allowedHosts: readonly string[] | null) => Promise<PackageBinInfo[]> }} */
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

/**
 * Extract package bins from virtual lockfile packages
 * @type {(virtualPackages: import('lockfile-tools/virtual').VirtualPackageInfo[], allowedHosts: readonly string[] | null) => Promise<PackageBinInfo[]>}
 */
async function extractPackageBinsFromVirtual(virtualPackages, allowedHosts) {
	/** @type {PackageBinInfo[]} */
	const packages = [];

	// Fetch bins for each package
	const binPromises = virtualPackages.map(async ({
		name,
		version,
		isDirect,
	}) => {
		const bins = await fetchPackageBins(name, version, allowedHosts);
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
		schema: [
			{
				type: 'object',
				properties: {
					allowedHosts: {
						type: 'array',
						items: { type: 'string', minLength: 1 },
						uniqueItems: true,
					},
				},
				additionalProperties: false,
			},
		],
		messages: {
			binaryConflict: 'Binary name conflict: "{{binary}}" is provided by multiple packages: {{packages}}',
			binaryConflictWithPreference: 'Binary name conflict: "{{binary}}" is provided by {{count}} packages. Currently active: {{active}} ({{reason}}). Also provided by: {{others}}',
			malformedLockfile: 'Lockfile "{{filename}}" is malformed: {{error}}',
		},
	},

	create(context) {
		/** @type {Lockfile[]} */
		const lockfiles = values(PACKAGE_MANAGERS).flatMap((pm) => pm.lockfiles);

		const optionAllowedHosts = /** @type {{ allowedHosts?: readonly string[] } | undefined} */ (context.options && context.options[0])?.allowedHosts;
		/** @type {readonly string[] | null} */
		const allowedHosts = optionAllowedHosts ? optionAllowedHosts : null;

		return {
			async Program(node) {
				// Use context.filename if available (ESLint 8.40+), fall back to getFilename() for older versions
				const filename = context.filename ?? context.getFilename();
				const dir = dirname(filename);
				/** @type {(filepath: string, dir: string, allowedHosts: readonly string[] | null) => Promise<PackageBinInfo[]>} */
				const extractPackageBinsFromLockfile = createLockfileExtractor(
					extracts,
					/** @type {(filepath: string, ...args: unknown[]) => Promise<PackageBinInfo[]>} */ (extractPackageBinsFromBunLockbBinary),
					makeLockfileContentLoader(context, loadLockfileContent),
				);

				// Check if any lockfile exists
				const lockfileExists = hasLockfile(dir);

				// If no lockfile exists, use virtual lockfile from arborist
				if (!lockfileExists) {
					const virtualPackages = await buildVirtualLockfile(dir);
					const packages = await extractPackageBinsFromVirtual(virtualPackages, allowedHosts);

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
						packages = await extractPackageBinsFromLockfile(lockfilePath, dir, allowedHosts);
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
