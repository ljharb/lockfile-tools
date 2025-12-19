/*
 *This rule ensures that the registry for every dependency in the lockfile matches the configured options.
 *
 *The default is the value of `npm config get registry`.
 *
 *If provided, it can be a string URL, or an array of string URLs. Each must be a valid http or https URL.
 */

import { dirname, join } from 'path';
import { execSync } from 'child_process';
import { minimatch } from 'minimatch';
import { PACKAGE_MANAGERS } from 'lockfile-tools/package-managers';
import { loadLockfileContent, loadBunLockbContent, getLockfileName, findJsonKeyLine } from 'lockfile-tools/io';
import { traverseDependencies, extractPackageName } from 'lockfile-tools/npm';
import { parseYarnLockfile, parsePnpmLockfile } from 'lockfile-tools/parsers';
import { normalizeRegistry, extractRegistryFromUrl } from 'lockfile-tools/registry';
import { hasLockfile, buildVirtualLockfile } from 'lockfile-tools/virtual';

const { from } = Array;
const { values } = Object;

/** @typedef {import('lockfile-tools/lib/package-managers.d.mts').PackageManager} PM */
/** @typedef {import('lockfile-tools/lib/types.d.ts').RegistryURL} RegistryURL */
/** @typedef {import('lockfile-tools/lib/package-managers.d.mts').Lockfile} Lockfile */
/** @typedef {{ name: string, registry: RegistryURL, line: number }} PackageRegistry */

function getDefaultRegistry() {
	try {
		return execSync('npm config get registry', { encoding: 'utf8' }).trim();
		/* istanbul ignore next - defensive: npm config rarely fails in practice */
	} catch {
		return 'https://registry.npmjs.org/';
	}
}

/** @typedef {{ registry: RegistryURL, line: number }} RegistryWithLine */

/** @type {(content: string) => RegistryWithLine[]} */
function extractRegistriesFromNpmLockfile(content) {
	/** @type {Map<RegistryURL, number>} */
	const registries = new Map();

	const parsed = JSON.parse(content);

	// Check packages
	if (parsed.packages) {
		Object.entries(parsed.packages).forEach(([key, pkg]) => {
			// Skip workspace symlinks (link: true means it's a local workspace package)
			if (pkg.link) {
				return;
			}
			if (pkg.resolved && typeof pkg.resolved === 'string') {
				const registry = extractRegistryFromUrl(pkg.resolved);
				if (registry) {
					const normalized = normalizeRegistry(registry);
					if (!registries.has(normalized)) {
						registries.set(normalized, findJsonKeyLine(content, key));
					}
				}
			}
		});
	}

	// Check dependencies (lockfile v1)
	if (parsed.dependencies) {
		traverseDependencies(parsed.dependencies, (name, dep) => {
			if (dep.resolved && typeof dep.resolved === 'string') {
				const registry = extractRegistryFromUrl(dep.resolved);
				if (registry) {
					const normalized = normalizeRegistry(registry);
					if (!registries.has(normalized)) {
						registries.set(normalized, findJsonKeyLine(content, name));
					}
				}
			}
		});
	}

	return from(registries.entries()).map(([registry, line]) => ({ registry, line }));
}

/** @type {(content: string) => RegistryWithLine[]} */
function extractRegistriesFromYarnLockfile(content) {
	/** @type {Map<RegistryURL, number>} */
	const registries = new Map();

	const entries = parseYarnLockfile(content, ['resolved']);
	entries.forEach(({ resolved, line }) => {
		if (resolved) {
			const registry = extractRegistryFromUrl(resolved);
			if (registry) {
				const normalized = normalizeRegistry(registry);
				if (!registries.has(normalized)) {
					registries.set(normalized, line);
				}
			}
		}
	});

	return from(registries.entries()).map(([registry, line]) => ({ registry, line }));
}

/** @type {(content: string) => RegistryWithLine[]} */
function extractRegistriesFromPnpmLockfile(content) {
	/** @type {Map<RegistryURL, number>} */
	const registries = new Map();

	const entries = parsePnpmLockfile(content, ['tarball']);
	entries.forEach(({ resolved, line }) => {
		if (resolved) {
			const registry = extractRegistryFromUrl(resolved);
			if (registry) {
				const normalized = normalizeRegistry(registry);
				if (!registries.has(normalized)) {
					registries.set(normalized, line);
				}
			}
		}
	});

	return from(registries.entries()).map(([registry, line]) => ({ registry, line }));
}

/** @type {(_content: string) => RegistryWithLine[]} */
// eslint-disable-next-line no-unused-vars
function extractRegistriesFromBunLockfile(_content) {
	/*
	 * bun.lock (text format) doesn't store registry URLs
	 * Only stores package names, versions, and integrity hashes
	 * Bun assumes packages come from the default registry
	 */
	return [];
}

/** @type {(filepath: string) => RegistryWithLine[]} */
function extractRegistriesFromBunLockbBinary(filepath) {
	const yarnLockContent = loadBunLockbContent(filepath);
	if (!yarnLockContent) {
		return [];
	}
	return extractRegistriesFromYarnLockfile(yarnLockContent);
}

/** @type {(content: string) => RegistryWithLine[]} */
function extractRegistriesFromVltLockfile(content) {
	/*
	 * vlt lockfiles don't store registry URLs, they use nodes format
	 * with no resolved field. Return empty array.
	 */

	JSON.parse(content); // Validate JSON

	return [];
}

/** @type {{ [k in Lockfile]: (s: string) => RegistryWithLine[] }} */
const extracts = {
	// @ts-expect-error TS doesn't understand dunder proto
	__proto__: null,
	'package-lock.json': extractRegistriesFromNpmLockfile,
	'npm-shrinkwrap.json': extractRegistriesFromNpmLockfile,
	'yarn.lock': extractRegistriesFromYarnLockfile,
	'pnpm-lock.yaml': extractRegistriesFromPnpmLockfile,
	'bun.lock': extractRegistriesFromBunLockfile,
	'bun.lockb': extractRegistriesFromBunLockfile,
	'vlt-lock.json': extractRegistriesFromVltLockfile,
};

/** @type {(filepath: string) => RegistryWithLine[]} */
function extractRegistriesFromLockfile(filepath) {
	const filename = getLockfileName(filepath);

	// Handle binary bun.lockb format specially
	if (filename === 'bun.lockb') {
		return extractRegistriesFromBunLockbBinary(filepath);
	}

	const content = loadLockfileContent(filepath);
	if (!content) {
		return [];
	}

	const extract = extracts[filename];
	/* istanbul ignore start - defensive: rule only checks known lockfile types */
	return extract?.(content) || [];
	/* istanbul ignore stop */
}

// Extract package names with their registries for pattern matching

/** @type {(content: string) => PackageRegistry[]} */
function extractPackageRegistriesFromNpmLockfile(content) {
	/** @type {PackageRegistry[]} */
	const packages = [];
	const parsed = JSON.parse(content);

	if (parsed.packages) {
		Object.entries(parsed.packages).forEach(([key, pkg]) => {
			if (key === '') {
				return;
			}
			// Skip workspace symlinks (link: true means it's a local workspace package)
			if (pkg.link) {
				return;
			}
			if (pkg.resolved && typeof pkg.resolved === 'string') {
				const registry = extractRegistryFromUrl(pkg.resolved);
				if (registry) {
					packages.push({
						name: extractPackageName(key),
						registry: normalizeRegistry(registry),
						line: findJsonKeyLine(content, key),
					});
				}
			}
		});
	}

	if (parsed.dependencies) {
		traverseDependencies(parsed.dependencies, (name, dep) => {
			if (dep.resolved && typeof dep.resolved === 'string') {
				const registry = extractRegistryFromUrl(dep.resolved);
				if (registry) {
					packages.push({
						name: extractPackageName(name),
						registry: normalizeRegistry(registry),
						line: findJsonKeyLine(content, name),
					});
				}
			}
		});
	}

	return packages;
}

/** @type {(content: string) => PackageRegistry[]} */
function extractPackageRegistriesFromYarnLockfile(content) {
	/** @type {PackageRegistry[]} */
	const packages = [];

	const entries = parseYarnLockfile(content, ['resolved']);
	entries.forEach(({
		name, resolved, line,
	}) => {
		if (resolved) {
			const registry = extractRegistryFromUrl(resolved);
			if (registry) {
				const nameMatch = name.match(/^(@?[^@]+)/);
				/* istanbul ignore next - defensive: yarn package names always match this pattern */
				const pkgName = nameMatch ? nameMatch[1] : name;
				packages.push({
					name: pkgName,
					registry: normalizeRegistry(registry),
					line,
				});
			}
		}
	});

	return packages;
}

/** @type {(content: string) => PackageRegistry[]} */
function extractPackageRegistriesFromPnpmLockfile(content) {
	/** @type {PackageRegistry[]} */
	const packages = [];

	const entries = parsePnpmLockfile(content, ['tarball']);
	entries.forEach(({
		name, resolved, line,
	}) => {
		if (resolved) {
			const registry = extractRegistryFromUrl(resolved);
			if (registry) {
				// Extract package name from pnpm key format: "pkg@version" or "@scope/pkg@version"
				const nameMatch = name.match(/^(@?[^@]+)/);
				/* istanbul ignore next - defensive: pnpm package names always match this pattern */
				const pkgName = nameMatch ? nameMatch[1] : name;
				packages.push({
					name: pkgName,
					registry: normalizeRegistry(registry),
					line,
				});
			}
		}
	});

	return packages;
}

/** @type {(filepath: string) => PackageRegistry[]} */
function extractPackageRegistriesFromLockfile(filepath) {
	const filename = getLockfileName(filepath);

	// skip binary bun.lockb format
	if (filename === 'bun.lockb') {
		return [];
	}

	const content = loadLockfileContent(filepath);
	if (!content) {
		return [];
	}

	// bun.lock and vlt-lock.json don't store registry URLs
	if (filename === 'bun.lock' || filename === 'vlt-lock.json') {
		return [];
	}

	if (filename === 'package-lock.json' || filename === 'npm-shrinkwrap.json') {
		return extractPackageRegistriesFromNpmLockfile(content);
	}

	if (filename === 'yarn.lock') {
		return extractPackageRegistriesFromYarnLockfile(content);
	}

	if (filename === 'pnpm-lock.yaml') {
		return extractPackageRegistriesFromPnpmLockfile(content);
	}
	/* istanbul ignore start - defensive: rule only checks known lockfile types */

	return [];
	/* istanbul ignore stop */
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
	meta: {
		type: 'problem',
		docs: {
			description: 'enforce allowed registries in lockfiles',
			category: 'Possible Errors',
			recommended: true,
			url: 'https://github.com/ljharb/eslint-plugin-lockfile/blob/main/docs/rules/registry.md',
		},
		schema: [
			{
				oneOf: [
					{
						type: 'string',
						format: 'uri',
						pattern: '^https?://',
					},
					{
						type: 'array',
						items: {
							type: 'string',
							format: 'uri',
							pattern: '^https?://',
						},
						minItems: 1,
					},
					{
						type: 'object',
						patternProperties: {
							'^https?://': {
								oneOf: [
									{ type: 'boolean', enum: [true] },
									{ type: 'string' },
									{
										type: 'array',
										items: { type: 'string' },
										minItems: 1,
										uniqueItems: true,
									},
								],
							},
						},
						additionalProperties: false,
					},
				],
			},
		],
		messages: {
			disallowedRegistry: 'Lockfile "{{filename}}" contains disallowed registry "{{registry}}". Allowed: {{allowed}}',
			disallowedPackageRegistry: 'Package "{{package}}" in lockfile "{{filename}}" uses disallowed registry "{{registry}}" (expected "{{expected}}")',
			multipleRegistryMatches: 'Package "{{package}}" matches multiple registry patterns: {{registries}}',
			multipleTrueRegistries: 'Configuration error: only one registry can have value `true`, but found multiple',
			malformedLockfile: 'Lockfile "{{filename}}" is malformed: {{error}}',
		},
	},

	create(context) {
		const config = context.options[0] || getDefaultRegistry();
		const isObjectConfig = typeof config === 'object' && !Array.isArray(config);

		// Validate object config has only one `true` value
		if (isObjectConfig) {
			const trueRegistries = Object.entries(config).filter(([, v]) => v === true);
			if (trueRegistries.length > 1) {
				// Use context.sourceCode if available (ESLint 8.40+), fall back to getSourceCode() for older versions
				const sourceCode = context.sourceCode ?? context.getSourceCode();
				context.report({
					node: sourceCode.ast,
					messageId: 'multipleTrueRegistries',
				});
				return {};
			}
		}

		/** @type {Lockfile[]} */
		const lockfiles = values(PACKAGE_MANAGERS).flatMap((pm) => pm.lockfiles);

		if (isObjectConfig) {
			// Object configuration: registry URLs map to package patterns
			/** @type {Map<RegistryURL, string[] | true>} */
			const registryPatterns = new Map();
			/** @type {RegistryURL | null} */
			let defaultRegistry = null;

			Object.entries(config).forEach(([registry, patterns]) => {
				const normalized = normalizeRegistry(registry);
				if (patterns === true) {
					defaultRegistry = normalized;
				} else {
					const patternArray = Array.isArray(patterns) ? patterns : [patterns];
					registryPatterns.set(normalized, patternArray);
				}
			});

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

						/** @type {PackageRegistry[]} */
						const packages = virtualPackages
							.filter((pkg) => pkg.resolved)
							.map((pkg) => {
								const { resolved, name } = pkg;
								const registry = extractRegistryFromUrl(/** @type {string} */ (resolved));
								return {
									name,
									registry: /** @type {RegistryURL} */ (registry),
									line: 0, // Virtual lockfile has no file, so no line number
								};
							})
							.filter((pkg) => pkg.registry);

						packages.forEach(({ name, registry }) => {
							// Find which registries match this package
							/** @type {RegistryURL[]} */
							const matchingRegistries = [];

							registryPatterns.forEach((patterns, reg) => {
								if (patterns !== true && patterns.some((pattern) => minimatch(name, pattern))) {
									matchingRegistries.push(reg);
								}
							});

							// Check for multiple pattern matches
							if (matchingRegistries.length > 1) {
								context.report({
									node,
									messageId: 'multipleRegistryMatches',
									data: {
										package: name,
										registries: matchingRegistries.join(', '),
									},
								});
								return;
							}

							// Determine expected registry
							/* istanbul ignore next 2 - defensive: matchingRegistries.length can only be 0 or 1 here */
							const expectedRegistry = matchingRegistries.length === 1
								? matchingRegistries[0]
								: defaultRegistry;

							if (!expectedRegistry) {
								// No registry configured for this package - report error
								context.report({
									node,
									messageId: 'disallowedPackageRegistry',
									data: {
										package: name,
										filename: 'virtual',
										registry,
										expected: 'none (no pattern matched)',
									},
								});
								return;
							}

							if (registry !== expectedRegistry) {
								context.report({
									node,
									messageId: 'disallowedPackageRegistry',
									data: {
										package: name,
										filename: 'virtual',
										registry,
										expected: expectedRegistry,
									},
								});
							}
						});

						return;
					}

					lockfiles.forEach((lockfileName) => {
						const lockfilePath = join(dir, lockfileName);

						/** @type {PackageRegistry[]} */
						let packages;
						try {
							packages = extractPackageRegistriesFromLockfile(lockfilePath);
						} catch (e) {
							context.report({
								node,
								messageId: 'malformedLockfile',
								data: {
									filename: lockfileName,
									/* istanbul ignore start - defensive: all real errors are Error instances */
									error: e instanceof Error ? e.message : String(e),
									/* istanbul ignore stop */
								},
							});
							return;
						}

						packages.forEach(({
							name, registry, line,
						}) => {
							// Find which registries match this package
							/** @type {RegistryURL[]} */
							const matchingRegistries = [];

							registryPatterns.forEach((patterns, reg) => {
								if (patterns !== true && patterns.some((pattern) => minimatch(name, pattern))) {
									matchingRegistries.push(reg);
								}
							});

							/** @type {import('eslint').AST.SourceLocation | undefined} */
							const loc = line ? { start: { line, column: 0 }, end: { line, column: 0 } } : undefined;

							// Check for multiple pattern matches
							if (matchingRegistries.length > 1) {
								context.report({
									node,
									loc,
									messageId: 'multipleRegistryMatches',
									data: {
										package: name,
										registries: matchingRegistries.join(', '),
									},
								});
								return;
							}

							// Determine expected registry
							const expectedRegistry = matchingRegistries.length === 1
								? matchingRegistries[0]
								: defaultRegistry;

							if (!expectedRegistry) {
								// No registry configured for this package - report error
								context.report({
									node,
									loc,
									messageId: 'disallowedPackageRegistry',
									data: {
										package: name,
										filename: lockfileName,
										registry,
										expected: 'none (no pattern matched)',
									},
								});
								return;
							}

							if (registry !== expectedRegistry) {
								context.report({
									node,
									loc,
									messageId: 'disallowedPackageRegistry',
									data: {
										package: name,
										filename: lockfileName,
										registry,
										expected: expectedRegistry,
									},
								});
							}
						});
					});
				},
			};
		}

		// String or array configuration
		const allowedRegistries = /** @type {RegistryURL[]} */ ([]).concat(config);
		const normalizedAllowed = allowedRegistries.map(normalizeRegistry);

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

					/** @type {Set<RegistryURL>} */
					const registrySet = new Set();

					virtualPackages.forEach((pkg) => {
						if (pkg.resolved) {
							const registry = extractRegistryFromUrl(pkg.resolved);
							if (registry) {
								registrySet.add(registry);
							}
						}
					});

					registrySet.forEach((registry) => {
						if (!normalizedAllowed.includes(registry)) {
							context.report({
								node,
								messageId: 'disallowedRegistry',
								data: {
									filename: 'virtual',
									registry,
									allowed: normalizedAllowed.join(', '),
								},
							});
						}
					});

					return;
				}

				lockfiles.forEach((lockfileName) => {
					const lockfilePath = join(dir, lockfileName);

					/** @type {RegistryWithLine[]} */
					let registries;
					try {
						registries = extractRegistriesFromLockfile(lockfilePath);
					} catch (e) {
						// Malformed lockfile - report error
						context.report({
							node,
							messageId: 'malformedLockfile',
							data: {
								filename: lockfileName,
								/* istanbul ignore start - defensive: all real errors are Error instances */
								error: e instanceof Error ? e.message : String(e),
								/* istanbul ignore stop */
							},
						});
						return;
					}

					registries.forEach(({ registry, line }) => {
						if (!normalizedAllowed.includes(registry)) {
							/** @type {import('eslint').AST.SourceLocation | undefined} */
							const loc = line ? { start: { line, column: 0 }, end: { line, column: 0 } } : undefined;
							context.report({
								node,
								loc,
								messageId: 'disallowedRegistry',
								data: {
									filename: lockfileName,
									registry,
									allowed: normalizedAllowed.join(', '),
								},
							});
						}
					});
				});
			},
		};
	},
};
