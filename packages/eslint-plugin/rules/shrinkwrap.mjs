/*
This rule detects when a dependency in the lockfile includes an npm-shrinkwrap.json.

When a dependency includes an npm-shrinkwrap.json, npm will use it to lock the dependency's
transitive dependencies to specific versions. This can prevent security updates from being
applied, cause version conflicts, and make the dependency tree harder to reason about.

This rule uses pacote to fetch package manifests without requiring node_modules to be installed.
*/

import { dirname, join } from 'path';
import npa from 'npm-package-arg';
import { minimatch } from 'minimatch';
import { satisfies } from 'semver';
import { getManifest } from '../manifest-cache.mjs';
import { PACKAGE_MANAGERS } from 'lockfile-tools/package-managers';
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

const { values } = Object;

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
 * Check if a package has an npm-shrinkwrap.json via its manifest
 * @type {(packageName: string, version: string, allowedHosts: readonly string[] | null) => Promise<boolean | null>}
 */
async function hasShrinkwrap(packageName, version, allowedHosts) {
	if (!isAllowedSpec(version, allowedHosts)) {
		return null;
	}
	try {
		const manifest = await getManifest(`${packageName}@${version}`);

		// eslint-disable-next-line no-underscore-dangle
		return !!manifest._hasShrinkwrap;
	} catch {
		// Package not found or network error
		return null;
	}
}

/** @type {(content: string) => PackageEntry[]} */
function extractPackagesFromNPMLockfile(content) {
	/** @type {PackageEntry[]} */
	const out = [];
	const root = getRootObject(parseJSON(content));

	// Lockfile v2/v3: top-level "packages" map
	forEachNpmPackagesMember(getMember(root, 'packages'), (member, key) => {
		out.push({
			name: extractPackageName(key),
			version: getStringMember(member.value, 'version') || 'unknown',
			line: nodeLine(member),
		});
	});

	// Lockfile v1: recursive "dependencies"
	traverseDependenciesAST(getMember(root, 'dependencies'), (member, fullName) => {
		out.push({
			name: fullName,
			version: getStringMember(member.value, 'version') || 'unknown',
			line: nodeLine(member),
		});
	});

	return out;
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
	/** @type {PackageEntry[]} */
	const out = [];
	const root = getRootObject(parseJSON(content));

	forEachMember(getMember(root, 'packages'), (member) => {
		if (member.value.type !== 'Array' || member.value.elements.length < 2) {
			return;
		}
		const [nameAtVersionEl, versionEl] = member.value.elements;
		const nameAtVersion = nameAtVersionEl.value.type === 'String' ? nameAtVersionEl.value.value : '';
		const version = versionEl.value.type === 'String' ? versionEl.value.value : 'unknown';
		const atIndex = nameAtVersion.lastIndexOf('@');
		const pkgName = atIndex > 0 ? nameAtVersion.slice(0, atIndex) : nameAtVersion;
		out.push({
			name: pkgName,
			version,
			line: nodeLine(member),
		});
	});

	return out;
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
	/** @type {PackageEntry[]} */
	const out = [];
	const root = getRootObject(parseJSON(content));

	forEachMember(getMember(root, 'nodes'), (member, key) => {
		if (member.value.type !== 'Array' || member.value.elements.length < 2) {
			return;
		}
		const [, nameEl] = member.value.elements;
		const name = nameEl.value.type === 'String' ? nameEl.value.value : '';
		const atIndex = key.lastIndexOf('@');
		const version = atIndex > 0 ? key.slice(atIndex + 1) : '';
		out.push({
			name,
			version: version || 'unknown',
			line: nodeLine(member),
		});
	});

	return out;
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
			hasShrinkwrap: 'Package `{{name}}@{{version}}` in lockfile `{{filename}}` includes an npm-shrinkwrap.json',
			invalidIgnoreEntry: 'Invalid ignore entry `{{specifier}}`: {{error}}',
			malformedLockfile: 'Lockfile "{{filename}}" is malformed: {{error}}',
		},
	},

	create(context) {
		/** @type {string[]} */
		const ignoreSpecs = context.options[0] || [];

		const optionAllowedHosts = /** @type {{ allowedHosts?: readonly string[] } | undefined} */ (context.options && context.options[1])?.allowedHosts;
		/** @type {readonly string[] | null} */
		const allowedHosts = optionAllowedHosts ? optionAllowedHosts : null;

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
				const extractPackagesFromLockfile = createLockfileExtractor(
					extracts,
					extractPackagesFromBunLockbBinary,
					makeLockfileContentLoader(context, loadLockfileContent),
				);

				// Check if any lockfile exists
				const lockfileExists = hasLockfile(dir);

				// If no lockfile exists, use virtual lockfile from arborist
				if (!lockfileExists) {
					const virtualPackages = await buildVirtualLockfile(dir);

					const results = await Promise.all(virtualPackages.map(async ({
						name,
						version,
					}) => {
						const result = await hasShrinkwrap(name, version, allowedHosts);
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
						const result = await hasShrinkwrap(name, version, allowedHosts);
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
