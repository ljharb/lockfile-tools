/*
This rule warns on dependencies that are pulled from non-registry sources (GitHub URLs, tarball URLs, git URLs, file paths, etc.) rather than npm registries.

Non-registry specifiers can bypass integrity checks and may not be as reliable as published packages.

The rule can be configured with an `ignore` array containing objects with:
- `specifier`: The dependency specifier to ignore (e.g., "github:user/repo#branch")
- `explanation`: A justification for why this non-registry dependency is allowed

The rule also warns on non-HTTPS registry URLs as they are insecure.
*/

import { dirname, join } from 'path';
import { PACKAGE_MANAGERS } from 'lockfile-tools/package-managers';
import { loadBunLockbContent, findJsonKeyLine } from 'lockfile-tools/io';
import { traverseDependencies } from 'lockfile-tools/npm';
import { parseYarnLockfile, parsePnpmLockfile, createLockfileExtractor } from 'lockfile-tools/parsers';
import { extractRegistryFromUrl } from 'lockfile-tools/registry';
import { hasLockfile, buildVirtualLockfile } from 'lockfile-tools/virtual';

const { values } = Object;

/** @typedef {import('lockfile-tools/lib/package-managers.d.mts').Lockfile} Lockfile */
/** @typedef {import('lockfile-tools/lib/types.d.ts').RegistryURL} RegistryURL */

/**
 * @typedef {Object} IgnoreEntry
 * @property {string} specifier - The dependency specifier to ignore
 * @property {string} explanation - Justification for allowing this non-registry dependency
 */

/** @typedef {{ name: string, resolved: string | null, line: number }} DependencyInfo */

/** @type {(url: string) => boolean} */
function isRegistryUrl(url) {
	// Registry URLs should be http:// or https:// URLs pointing to a package tarball
	if (!(/^https?:\/\//).test(url)) {
		return false;
	}

	// Check if this looks like a registry URL pattern:
	// - Contains /-/ separator (npm registry pattern): /package-name/-/package-name-version.tgz
	// - OR ends with common registry hosts
	if ((/\/-\//).test(url)) {
		return true;
	}

	return false;
}

/** @type {(url: string) => boolean} */
function isNonHttpsRegistry(url) {
	// Check if it's a registry URL but using HTTP instead of HTTPS
	if (!(/^http:\/\//).test(url)) {
		return false;
	}
	const registry = extractRegistryFromUrl(url);
	return !!registry;
}

/** @type {(url: string) => string} */
function getNonRegistryType(url) {
	if ((/^git(\+https?)?:\/\//).test(url)) {
		return 'git URL';
	}
	if ((/^github:/).test(url)) {
		return 'GitHub shorthand';
	}
	if ((/^https?:\/\/github\.com\/[^/]+\/[^/]+\/tarball\//).test(url)) {
		return 'GitHub tarball URL';
	}
	if ((/^https?:\/\/codeload\.github\.com\//).test(url)) {
		return 'GitHub codeload URL';
	}
	if ((/^file:/).test(url)) {
		return 'file path';
	}
	if ((/^https?:\/\//).test(url) && !isRegistryUrl(url)) {
		return 'tarball URL';
	}
	/* istanbul ignore next - defensive: all known patterns are handled above */
	return 'non-registry specifier';
}

/** @type {(content: string) => DependencyInfo[]} */
function extractDepsFromNpmLockfile(content) {
	/** @type {DependencyInfo[]} */
	const deps = [];
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
				deps.push({
					name: key,
					resolved: pkg.resolved,
					line: findJsonKeyLine(content, key),
				});
			}
		});
	}

	if (parsed.dependencies) {
		traverseDependencies(parsed.dependencies, (name, dep) => {
			if (dep.resolved && typeof dep.resolved === 'string') {
				deps.push({
					name,
					resolved: dep.resolved,
					line: findJsonKeyLine(content, name),
				});
			}
		});
	}

	return deps;
}

/** @type {(content: string) => DependencyInfo[]} */
function extractDepsFromYarnLockfile(content) {
	const entries = parseYarnLockfile(content, ['resolved']);
	return entries.map(({
		name, resolved, line,
	}) => ({
		name,
		resolved,
		line,
	}));
}

/** @type {(content: string) => DependencyInfo[]} */
function extractDepsFromPnpmLockfile(content) {
	const entries = parsePnpmLockfile(content, ['tarball']);
	return entries.map(({
		name, resolved, line,
	}) => ({
		name,
		resolved,
		line,
	}));
}

/** @type {(_content: string) => DependencyInfo[]} */
// eslint-disable-next-line no-unused-vars
function extractDepsFromBunLockfile(_content) {
	// bun.lock (text format) only stores package names and versions
	// It doesn't store resolved URLs, so we can't detect non-registry specifiers
	/* istanbul ignore start - bun.lock doesn't store resolved URLs */
	return [];
	/* istanbul ignore stop */
}

/** @type {(filepath: string) => DependencyInfo[]} */
function extractDepsFromBunLockbBinary(filepath) {
	const yarnLockContent = loadBunLockbContent(filepath);
	/* istanbul ignore next - defensive: bun.lockb loading rarely fails */
	if (!yarnLockContent) {
		return [];
	}
	return extractDepsFromYarnLockfile(yarnLockContent);
}

/** @type {(_content: string) => DependencyInfo[]} */
// eslint-disable-next-line no-unused-vars
function extractDepsFromVltLockfile(_content) {
	// vlt lockfiles use nodes format without resolved URLs
	// Can't detect non-registry specifiers
	return [];
}

/** @type {{ [k in Lockfile]: (s: string) => DependencyInfo[] }} */
const extracts = {
	// @ts-expect-error TS doesn't understand dunder proto
	__proto__: null,
	'package-lock.json': extractDepsFromNpmLockfile,
	'npm-shrinkwrap.json': extractDepsFromNpmLockfile,
	'yarn.lock': extractDepsFromYarnLockfile,
	'pnpm-lock.yaml': extractDepsFromPnpmLockfile,
	'bun.lock': extractDepsFromBunLockfile,
	'bun.lockb': extractDepsFromBunLockfile,
	'vlt-lock.json': extractDepsFromVltLockfile,
};

/** @type {(filepath: string) => DependencyInfo[]} */
const extractDepsFromLockfile = createLockfileExtractor(extracts, extractDepsFromBunLockbBinary);

/** @type {import('eslint').Rule.RuleModule} */
export default {
	meta: {
		type: 'problem',
		docs: {
			description: 'warn on dependencies from non-registry sources',
			category: 'Possible Errors',
			recommended: false,
			url: 'https://github.com/ljharb/eslint-plugin-lockfile/blob/main/docs/rules/non-registry-specifiers.md',
		},
		schema: [
			{
				type: 'object',
				properties: {
					ignore: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								specifier: {
									type: 'string',
								},
								explanation: {
									type: 'string',
								},
							},
							required: ['specifier', 'explanation'],
							additionalProperties: false,
						},
					},
				},
				additionalProperties: false,
			},
		],
		messages: {
			nonRegistrySpecifier: 'Package "{{name}}" in lockfile "{{filename}}" uses {{type}}: {{resolved}}{{explanation}}',
			nonHttpsRegistry: 'Package "{{name}}" in lockfile "{{filename}}" uses insecure HTTP registry: {{resolved}}',
			malformedLockfile: 'Lockfile "{{filename}}" is malformed: {{error}}',
		},
	},

	create(context) {
		const options = context.options[0] || {};
		const ignore = options.ignore || [];

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

					virtualPackages.forEach(({ name, resolved }) => {
						if (!resolved) {
							return;
						}

						// Check if this dependency is in the ignore list
						// @ts-expect-error - TS7006
						const ignoreEntry = ignore.find((entry) => resolved === entry.specifier || resolved.includes(entry.specifier));

						// Check for non-HTTPS registry URLs first
						if (isNonHttpsRegistry(resolved)) {
							// HTTP registries are always reported, even if ignored for non-registry
							context.report({
								node,
								messageId: 'nonHttpsRegistry',
								data: {
									name,
									filename: 'virtual',
									resolved,
								},
							});
							return;
						}

						// Check if it's a non-registry URL
						if (!isRegistryUrl(resolved)) {
							if (ignoreEntry) {
								// Silently skip ignored entries with valid explanation
								return;
							}

							const type = getNonRegistryType(resolved);
							context.report({
								node,
								messageId: 'nonRegistrySpecifier',
								data: {
									name,
									filename: 'virtual',
									type,
									resolved,
									explanation: '',
								},
							});
						}
					});

					return;
				}

				lockfiles.forEach((lockfileName) => {
					const lockfilePath = join(dir, lockfileName);

					/** @type {DependencyInfo[]} */
					let deps;
					try {
						deps = extractDepsFromLockfile(lockfilePath);
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

					deps.forEach(({
						name, resolved, line,
					}) => {
						/* istanbul ignore start - defensive: packages without resolved URLs are filtered earlier */
						if (!resolved) {
							return;
						}
						/* istanbul ignore stop */

						/** @type {import('eslint').AST.SourceLocation | undefined} */
						const loc = line ? { start: { line, column: 0 }, end: { line, column: 0 } } : undefined;

						// Check if this dependency is in the ignore list; entry is inferred from ignore array
						// @ts-expect-error - TS7006
						const ignoreEntry = ignore.find((entry) => resolved === entry.specifier || resolved.includes(entry.specifier));
						// Check for non-HTTPS registry URLs first
						if (isNonHttpsRegistry(resolved)) {
							// HTTP registries are always reported, even if ignored for non-registry
							context.report({
								node,
								loc,
								messageId: 'nonHttpsRegistry',
								data: {
									name,
									filename: lockfileName,
									resolved,
								},
							});
							return;
						}

						// Check if it's a non-registry URL
						if (!isRegistryUrl(resolved)) {
							if (ignoreEntry) {
								// Silently skip ignored entries with valid explanation
								return;
							}

							const type = getNonRegistryType(resolved);
							context.report({
								node,
								loc,
								messageId: 'nonRegistrySpecifier',
								data: {
									name,
									filename: lockfileName,
									type,
									resolved,
									explanation: '',
								},
							});
						}
					});
				});
			},
		};
	},
};
