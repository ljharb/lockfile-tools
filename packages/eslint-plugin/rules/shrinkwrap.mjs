/*
This rule detects when a dependency in the lockfile includes an npm-shrinkwrap.json.

When a dependency includes an npm-shrinkwrap.json, npm will use it to lock the dependency's
transitive dependencies to specific versions. This can prevent security updates from being
applied, cause version conflicts, and make the dependency tree harder to reason about.

This rule uses pacote to fetch package manifests without requiring node_modules to be installed.
*/

import { dirname, join } from 'path';
import npa from 'npm-package-arg';
import pacote from 'pacote';
import { satisfies } from 'semver';
import { PACKAGE_MANAGERS } from 'lockfile-tools/package-managers';
import { loadBunLockbContent, findJsonKeyLine } from 'lockfile-tools/io';
import { extractPackageName } from 'lockfile-tools/npm';
import { parseYarnLockfile, createLockfileExtractor } from 'lockfile-tools/parsers';
import { hasLockfile, buildVirtualLockfile } from 'lockfile-tools/virtual';

const { values, entries } = Object;

/** @typedef {import('lockfile-tools/lib/package-managers.d.mts').Lockfile} Lockfile */

/**
 * @typedef {Object} PackageEntry
 * @property {string} name - Package name
 * @property {string} version - Package version
 * @property {number} line - Line number in lockfile where package appears
 */

/**
 * Check if a package name@version is ignored by any entry in the ignore list
 * @type {(packageName: string, version: string, ignoreList: import('npm-package-arg').Result[]) => boolean}
 */
function isIgnored(packageName, version, ignoreList) {
	return ignoreList.some((parsed) => (
		parsed.name === packageName && (
			parsed.rawSpec === ''
			|| parsed.rawSpec === '*'
			|| (parsed.fetchSpec && satisfies(version, parsed.fetchSpec))
		)
	));
}

/**
 * Check if a package has an npm-shrinkwrap.json via its manifest
 * @type {(packageName: string, version: string) => Promise<boolean | null>}
 */
async function hasShrinkwrap(packageName, version) {
	try {
		const manifest = await pacote.manifest(`${packageName}@${version}`, {
			preferOnline: false, // Use cache if available
			fullMetadata: true, // Need _hasShrinkwrap field
		});

		// eslint-disable-next-line no-underscore-dangle
		return !!manifest._hasShrinkwrap;
	} catch {
		// Package not found or network error
		return null;
	}
}

/** @type {(content: string) => PackageEntry[]} */
function extractPackagesFromNPMLockfile(content) {
	const parsed = JSON.parse(content);

	/** @type {(deps: Record<string, { version: string; dependencies?: Record<string, unknown> }>, prefix?: string) => PackageEntry[]} */
	function collectDeps(deps, prefix = '') {
		return entries(deps).flatMap(([name, dep]) => {
			const fullName = prefix ? `${prefix}/${name}` : name;
			return /** @type {PackageEntry[]} */ ([]).concat(
				{
					name: fullName,
					version: dep.version || /** @type {const} */ ('unknown'),
					line: findJsonKeyLine(content, name),
				},
				dep.dependencies
					? collectDeps(
						/** @type {Record<string, { version: string; dependencies?: Record<string, unknown> }>} */ (dep.dependencies),
						fullName,
					)
					: [],
			);
		});
	}

	return /** @type {PackageEntry[]} */ ([]).concat(
		// Check packages (lockfile v2/v3)
		parsed.packages
			? entries(parsed.packages)
				.filter(([key, pkg]) => (
					key !== ''
					&& !pkg.link // Skip workspace symlinks (link: true means it's a local workspace package)
					&& key.startsWith('node_modules/') // Skip workspace package definitions (entries not in node_modules/)
				))
				.map(([key, pkg]) => ({
					name: extractPackageName(key),
					version: pkg.version || 'unknown',
					line: findJsonKeyLine(content, key),
				}))
			: [],
		// Check dependencies (lockfile v1)
		parsed.dependencies
			? collectDeps(parsed.dependencies)
			: [],
	);
}

/** @type {(content: string) => PackageEntry[]} */
function extractPackagesFromYarnLockfile(content) {
	const parsedEntries = parseYarnLockfile(content, ['version']);
	return parsedEntries.map(({
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
}

/**
 * @typedef {Object} PNPMParseState
 * @property {boolean} inPackages
 * @property {string | null} currentPackage
 * @property {number} currentPackageLine
 * @property {readonly { key: string, line: number }[]} entries
 */

/** @type {(content: string) => PackageEntry[]} */
function extractPackagesFromPNPMLockfile(content) {
	const lines = content.split('\n');

	/** @type {PNPMParseState} */
	const initial = {
		inPackages: false,
		currentPackage: null,
		currentPackageLine: 0,
		entries: [],
	};

	const final = lines.reduce(
		/** @type {(state: PNPMParseState, line: string, i: number) => PNPMParseState} */
		(state, line, i) => {
			if (line.startsWith('packages:')) {
				return {
					inPackages: true,
					currentPackage: state.currentPackage,
					currentPackageLine: state.currentPackageLine,
					entries: state.entries,
				};
			}
			if (state.inPackages && line.match(/^ {2}\S/) && line.includes(':')) {
				return {
					inPackages: true,
					currentPackage: line.split(':')[0].trim().replace(/['"]/g, ''),
					currentPackageLine: i + 1, // 1-indexed
					entries: state.currentPackage
						? /** @type {readonly { key: string, line: number }[]} */ ([]).concat(
							state.entries,
							{
								key: state.currentPackage,
								line: state.currentPackageLine,
							},
						)
						: state.entries,
				};
			}
			return state;
		},
		initial,
	);

	const allEntries = final.currentPackage
		? /** @type {readonly { key: string, line: number }[]} */ ([]).concat(
			final.entries,
			{
				key: final.currentPackage,
				line: final.currentPackageLine,
			},
		)
		: final.entries;

	return allEntries.map(({ key, line }) => {
		const nameMatch = key.match(/^(@?[^@]+)/);
		const pkgName = nameMatch ? nameMatch[1] : key;
		const versionMatch = key.match(/@([^@]+)$/);
		return {
			name: pkgName,
			version: versionMatch ? versionMatch[1] : 'unknown',
			line,
		};
	});
}

/** @type {(content: string) => PackageEntry[]} */
function extractPackagesFromBunLockfile(content) {
	const parsed = JSON.parse(content);

	return parsed.packages
		? entries(parsed.packages)
			.filter(([, pkg]) => Array.isArray(pkg) && pkg.length >= 2)
			.map(([key, pkg]) => {
				const [nameAtVersion, version] = /** @type {[unknown, string]} */ (pkg);
				const nameAtVersionStr = String(nameAtVersion);
				const atIndex = nameAtVersionStr.lastIndexOf('@');
				const pkgName = atIndex > 0 ? nameAtVersionStr.slice(0, atIndex) : nameAtVersionStr;
				return {
					name: pkgName,
					version,
					line: findJsonKeyLine(content, key),
				};
			})
		: [];
}

/** @type {(filepath: string) => PackageEntry[]} */
function extractPackagesFromBunLockbBinary(filepath) {
	const yarnLockContent = loadBunLockbContent(filepath);
	if (!yarnLockContent) {
		return [];
	}
	return extractPackagesFromYarnLockfile(yarnLockContent);
}

/** @type {(content: string) => PackageEntry[]} */
function extractPackagesFromVltLockfile(content) {
	const parsed = JSON.parse(content);

	return parsed.nodes
		? entries(parsed.nodes)
			.filter(([, node]) => Array.isArray(node) && node.length >= 2)
			.map(([key, node]) => {
				const [, name] = /** @type {[unknown, string]} */ (node);
				const atIndex = key.lastIndexOf('@');
				const version = atIndex > 0 ? key.slice(atIndex + 1) : '';
				return {
					name,
					version: version || 'unknown',
					line: findJsonKeyLine(content, key),
				};
			})
		: [];
}

/** @type {{ [k in Lockfile]: (s: string) => PackageEntry[] }} */
const extracts = {
	// @ts-expect-error TS doesn't understand dunder proto
	__proto__: null,
	'package-lock.json': extractPackagesFromNPMLockfile,
	'npm-shrinkwrap.json': extractPackagesFromNPMLockfile,
	'yarn.lock': extractPackagesFromYarnLockfile,
	'pnpm-lock.yaml': extractPackagesFromPNPMLockfile,
	'bun.lock': extractPackagesFromBunLockfile,
	'bun.lockb': extractPackagesFromBunLockfile,
	'vlt-lock.json': extractPackagesFromVltLockfile,
};

/** @type {(filepath: string) => PackageEntry[]} */
const extractPackagesFromLockfile = createLockfileExtractor(extracts, extractPackagesFromBunLockbBinary);

/** @type {import('eslint').Rule.RuleModule} */
export default {
	meta: {
		type: 'problem',
		docs: {
			description: 'detect dependencies that include an npm-shrinkwrap.json',
			category: 'Possible Errors',
			recommended: true,
			url: 'https://github.com/ljharb/lockfile-tools/blob/HEAD/packages/eslint-plugin/docs/rules/shrinkwrap.md',
		},
		schema: [
			{
				type: 'array',
				items: {
					type: 'string',
					minLength: 1,
				},
				uniqueItems: true,
			},
		],
		messages: {
			hasShrinkwrap: 'Package `{{name}}@{{version}}` in lockfile `{{filename}}` includes an npm-shrinkwrap.json',
			invalidIgnoreEntry: 'Invalid ignore entry `{{specifier}}`: {{error}}',
			malformedLockfile: 'Lockfile "{{filename}}" is malformed: {{error}}',
		},
	},

	create(context) {
		/** @type {string[]} */
		const ignoreSpecs = context.options[0] || [];

		/** @type {Lockfile[]} */
		const lockfiles = values(PACKAGE_MANAGERS).flatMap((pm) => pm.lockfiles);

		return {
			async Program(node) {
				// Parse and validate ignore entries
				/** @type {import('npm-package-arg').Result[] | null} */
				const parsedIgnoreList = ignoreSpecs.reduce(
					/** @type {(acc: import('npm-package-arg').Result[] | null, specifier: string) => import('npm-package-arg').Result[] | null} */
					(acc, specifier) => {
						if (!acc) {
							return null;
						}
						/** @type {import('npm-package-arg').Result} */
						let parsed;
						try {
							parsed = npa(specifier);
						} catch (e) {
							context.report({
								node,
								messageId: 'invalidIgnoreEntry',
								data: {
									specifier,
									error: e instanceof Error ? e.message : String(e),
								},
							});
							return null;
						}
						if (!parsed.name) {
							context.report({
								node,
								messageId: 'invalidIgnoreEntry',
								data: {
									specifier,
									error: 'must include a package name',
								},
							});
							return null;
						}
						if (!parsed.registry) {
							context.report({
								node,
								messageId: 'invalidIgnoreEntry',
								data: {
									specifier,
									error: 'must be a registry specifier',
								},
							});
							return null;
						}
						return /** @type {import('npm-package-arg').Result[]} */ ([]).concat(acc, parsed);
					},
					/** @type {import('npm-package-arg').Result[]} */ ([]),
				);
				if (!parsedIgnoreList) {
					return;
				}

				// Use context.filename if available (ESLint 8.40+), fall back to getFilename() for older versions
				const filename = context.filename ?? context.getFilename();
				const dir = dirname(filename);

				// Check if any lockfile exists
				const lockfileExists = hasLockfile(dir);

				// If no lockfile exists, use virtual lockfile from arborist
				if (!lockfileExists) {
					const virtualPackages = await buildVirtualLockfile(dir);

					const results = await Promise.all(virtualPackages.map(async ({
						name,
						version,
					}) => {
						const result = await hasShrinkwrap(name, version);
						return {
							name,
							version,
							hasShrinkwrap: result,
						};
					}));

					results.forEach(({
						name,
						version,
						hasShrinkwrap: has,
					}) => {
						if (has && !isIgnored(name, version, parsedIgnoreList)) {
							context.report({
								node,
								messageId: 'hasShrinkwrap',
								data: {
									name,
									version,
									filename: 'virtual',
								},
							});
						}
					});

					return;
				}

				for (let li = 0; li < lockfiles.length; li++) {
					const lockfileName = lockfiles[li];
					const lockfilePath = join(dir, lockfileName);

					/** @type {PackageEntry[]} */
					let packages;
					try {
						packages = extractPackagesFromLockfile(lockfilePath);
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

					// Check all packages in parallel for shrinkwrap
					// eslint-disable-next-line no-await-in-loop
					const results = await Promise.all(packages.map(async ({
						name,
						version,
						line,
					}) => {
						const result = await hasShrinkwrap(name, version);
						return {
							name,
							version,
							line,
							hasShrinkwrap: result,
						};
					}));

					results.forEach(({
						name,
						version,
						line,
						hasShrinkwrap: has,
					}) => {
						if (has && !isIgnored(name, version, parsedIgnoreList)) {
							/** @type {import('eslint').AST.SourceLocation | undefined} */
							const loc = line ? { start: { line, column: 0 }, end: { line, column: 0 } } : void undefined;

							context.report({
								node,
								loc,
								messageId: 'hasShrinkwrap',
								data: {
									name,
									version,
									filename: lockfileName,
								},
							});
						}
					});
				}
			},
		};
	},
};
