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
import { loadLockfileContent, loadBunLockbContent, getLockfileName } from 'lockfile-tools/io';
import { makeLockfileContentLoader, getContextFilename, getContextSourceCode } from '../utils.mjs';
import { traverseDependenciesAST, forEachNpmPackagesMember, extractPackageName } from 'lockfile-tools/npm';
import { parseYarnLockfile, parsePnpmLockfile } from 'lockfile-tools/parsers';
import {
	parseJSON,
	getRootObject,
	getMember,
	getStringMember,
	nodeLine,
} from 'lockfile-tools/json-ast';
import { normalizeRegistry, extractRegistryFromUrl } from 'lockfile-tools/registry';
import { hasLockfile, buildVirtualLockfile } from 'lockfile-tools/virtual';

const { from, isArray } = Array;
const { values } = Object;

/** @import { AST, Rule } from 'eslint' */
/** @import { RegistryURL } from 'lockfile-tools/lib/types.d.ts' */
/** @import { Lockfile } from 'lockfile-tools/lib/package-managers.d.mts' */
/** @typedef {{ name: string, registry: RegistryURL, line: number }} PackageRegistry */

function getDefaultRegistry() {
	try {
		return execSync('npm config get registry', { encoding: 'utf8' }).trim();
	} catch {
		return 'https://registry.npmjs.org/';
	}
}

/** @typedef {{ registry: RegistryURL, line: number }} RegistryWithLine */

/** @type {(content: string) => RegistryWithLine[]} */
function extractRegistriesFromNpmLockfile(content) {
	/** @type {Map<RegistryURL, number>} */
	const registries = new Map();
	const root = getRootObject(parseJSON(content));

	forEachNpmPackagesMember(getMember(root, 'packages'), (member) => {
		const resolved = getStringMember(member.value, 'resolved');
		if (resolved) {
			const registry = extractRegistryFromUrl(resolved);
			if (registry) {
				const normalized = normalizeRegistry(registry);
				if (!registries.has(normalized)) {
					registries.set(normalized, nodeLine(member));
				}
			}
		}
	});

	traverseDependenciesAST(getMember(root, 'dependencies'), (member) => {
		const resolved = getStringMember(member.value, 'resolved');
		if (resolved) {
			const registry = extractRegistryFromUrl(resolved);
			if (registry) {
				const normalized = normalizeRegistry(registry);
				if (!registries.has(normalized)) {
					registries.set(normalized, nodeLine(member));
				}
			}
		}
	});

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
	 * with no resolved field. Parse to validate JSON, then return empty.
	 */

	parseJSON(content);

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

/** @type {(filepath: string, getContent: (filepath: string) => string | null) => RegistryWithLine[]} */
function extractRegistriesFromLockfile(filepath, getContent) {
	const filename = getLockfileName(filepath);

	// Handle binary bun.lockb format specially
	if (filename === 'bun.lockb') {
		return extractRegistriesFromBunLockbBinary(filepath);
	}

	const content = getContent(filepath);
	if (!content) {
		return [];
	}

	const extract = extracts[filename];
	/* istanbul ignore next - defensive: unknown lockfile types not in extractors map */
	return extract?.(content) || [];
}

// Extract package names with their registries for pattern matching

/** @type {(content: string) => PackageRegistry[]} */
function extractPackageRegistriesFromNpmLockfile(content) {
	/** @type {PackageRegistry[]} */
	const packages = [];
	const root = getRootObject(parseJSON(content));

	forEachNpmPackagesMember(getMember(root, 'packages'), (member, key) => {
		const resolved = getStringMember(member.value, 'resolved');
		if (resolved) {
			const registry = extractRegistryFromUrl(resolved);
			if (registry) {
				packages.push({
					name: extractPackageName(key),
					registry: normalizeRegistry(registry),
					line: nodeLine(member),
				});
			}
		}
	});

	traverseDependenciesAST(getMember(root, 'dependencies'), (member, name) => {
		const resolved = getStringMember(member.value, 'resolved');
		if (resolved) {
			const registry = extractRegistryFromUrl(resolved);
			if (registry) {
				packages.push({
					name: extractPackageName(name),
					registry: normalizeRegistry(registry),
					line: nodeLine(member),
				});
			}
		}
	});

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

/** @type {(filepath: string, getContent: (filepath: string) => string | null) => PackageRegistry[]} */
function extractPackageRegistriesFromLockfile(filepath, getContent) {
	const filename = getLockfileName(filepath);

	// skip binary bun.lockb format
	if (filename === 'bun.lockb') {
		return [];
	}

	const content = getContent(filepath);
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

	/* istanbul ignore next - defensive: all known lockfile types are handled above */
	return [];
}

/** @type {Rule.RuleModule} */
export default {
	meta: {
		type: 'problem',
		docs: {
			description: 'enforce allowed registries in lockfiles',
			// @ts-expect-error - `category` was removed from `RulesMetaDocs` in eslint@10 types but is still consumed by eslint-doc-generator
			category: 'Possible Errors',
			recommended: true,
			url: 'https://github.com/ljharb/lockfile-tools/blob/HEAD/packages/eslint-plugin/docs/rules/registry.md',
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
		const isObjectConfig = typeof config === 'object' && !isArray(config);

		// Validate object config has only one `true` value
		if (isObjectConfig) {
			const trueRegistries = Object.entries(config).filter(([, v]) => v === true);
			if (trueRegistries.length > 1) {
				// Use context.sourceCode if available (ESLint 8.40+), fall back to getSourceCode() for older versions
				const sourceCode = getContextSourceCode(context);
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
					/** @type {string[]} */
					const patternArray = [].concat(patterns);
					registryPatterns.set(normalized, patternArray);
				}
			});

			return {
				async Program(node) {
					// Use context.filename if available (ESLint 8.40+), fall back to getFilename() for older versions
					const filename = getContextFilename(context);
					const dir = dirname(filename);
					const getContent = makeLockfileContentLoader(context, loadLockfileContent);

					// Check if any lockfile exists
					const lockfileExists = hasLockfile(dir);

					// If no lockfile exists, use virtual lockfile from arborist
					if (!lockfileExists) {
						const virtualPackages = await buildVirtualLockfile(dir);

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
							packages = extractPackageRegistriesFromLockfile(lockfilePath, getContent);
						} catch (e) {
							context.report({
								node,
								messageId: 'malformedLockfile',
								data: {
									filename: lockfileName,
									error: e instanceof Error ? e.message : String(e),
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

							/** @type {AST.SourceLocation | undefined} */
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
				const filename = getContextFilename(context);
				const dir = dirname(filename);
				const getContent = makeLockfileContentLoader(context, loadLockfileContent);

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
						registries = extractRegistriesFromLockfile(lockfilePath, getContent);
					} catch (e) {
						// Malformed lockfile - report error
						context.report({
							node,
							messageId: 'malformedLockfile',
							data: {
								filename: lockfileName,
								error: e instanceof Error ? e.message : String(e),
							},
						});
						return;
					}

					registries.forEach(({ registry, line }) => {
						if (!normalizedAllowed.includes(registry)) {
							/** @type {AST.SourceLocation | undefined} */
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
