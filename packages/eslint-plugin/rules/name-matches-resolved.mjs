/*
This rule enforces that the package name embedded in a registry tarball URL matches the
package name the lockfile records that URL under.

npm registry tarball URLs follow the convention `{registry}/{name}/-/{name}-{version}.tgz`,
so the name is recoverable from the URL itself. If the lockfile keys a package as `lodash`
but its `resolved` URL points at a tarball for some other package, the lockfile has been
tampered with (or hand-edited incorrectly) and an install would silently fetch the wrong
code under a trusted name - a lockfile-poisoning / dependency-substitution vector.

Only registry tarball URLs (those containing the `/-/` separator) are checked; git, tarball,
and file specifiers are the domain of the `non-registry-specifiers` rule. Formats that do not
store a per-package registry URL for registry dependencies (pnpm, bun.lock, vlt) cannot be
checked and are skipped.
*/

import { dirname, join } from 'path';
import { PACKAGE_MANAGERS } from 'lockfile-tools/package-managers';
import { loadLockfileContent, loadBunLockbContent } from 'lockfile-tools/io';
import { forEachNpmPackagesMember, traverseDependenciesAST } from 'lockfile-tools/npm';
import { parseYarnLockfile, createLockfileExtractor } from 'lockfile-tools/parsers';
import {
	parseJSON,
	getRootObject,
	getMember,
	getStringMember,
	memberKey,
	nodeLine,
} from 'lockfile-tools/json-ast';
import { makeLockfileContentLoader, getContextFilename } from '../utils.mjs';

const { values } = Object;

/** @import { Rule } from 'eslint' */

/** @typedef {{ name: string, resolved: string | null, line: number }} EntryInfo */

/**
 * Recovers the package name encoded in a registry tarball URL of the form
 * `{registry}/{name}/-/{name}-{version}.tgz` (the path segment, or scope + name,
 * immediately before the `/-/` separator). Returns `null` for non-tarball or
 * non-http(s) URLs, which this rule does not police.
 * @param {string} resolved
 */
function registryTarballName(resolved) {
	/** @type {URL} */
	let url;
	try {
		url = new URL(resolved);
	} catch {
		return null;
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') {
		return null;
	}
	const separatorIndex = url.pathname.indexOf('/-/');
	if (separatorIndex === -1) {
		return null;
	}
	const segments = url.pathname.slice(0, separatorIndex).split('/').filter(Boolean);
	if (segments.length === 0) {
		return null;
	}
	const last = segments[segments.length - 1];
	const previous = segments[segments.length - 2];
	return previous && previous.startsWith('@') ? `${previous}/${last}` : last;
}

/**
 * Strips a version/range suffix (and any leading `/` or surrounding quotes, and
 * trailing comma-separated descriptors) from a yarn/pnpm-style key to recover
 * the bare package name. `@scope/pkg@1.2.3` -> `@scope/pkg`; `lodash@^4` -> `lodash`.
 * @param {string} raw
 */
function bareName(raw) {
	const first = raw.split(',')[0].trim().replace(/^"|"$/g, '').replace(/^\//, '');
	const atIndex = first.lastIndexOf('@');
	return atIndex > 0 ? first.slice(0, atIndex) : first;
}

const marker = 'node_modules/';
/**
 * Recovers the actual package name from an npm v2/v3 lockfile key by taking the
 * segment after the final `node_modules/` (so nested deps resolve to the leaf
 * package, and scoped names stay intact). `forEachNpmPackagesMember` only yields
 * keys that start with `node_modules/`, so the marker is always present.
 * @param {string} key
 */
function leafPackageName(key) {
	return key.slice(key.lastIndexOf(marker) + marker.length);
}

/** @type {(content: string) => EntryInfo[]} */
function extractFromNpmLockfile(content) {
	/** @type {EntryInfo[]} */
	const entries = [];
	const root = getRootObject(parseJSON(content));

	forEachNpmPackagesMember(getMember(root, 'packages'), (member, key) => {
		entries[entries.length] = {
			name: leafPackageName(key),
			resolved: getStringMember(member.value, 'resolved'),
			line: nodeLine(member),
		};
	});

	// npm v1 `dependencies` are keyed by the bare package name (nested
	// recursively). Reuse the shared traversal, but take the leaf key from the
	// member node rather than its joined `parent/child` path, so scoped names
	// stay intact.
	traverseDependenciesAST(getMember(root, 'dependencies'), (member) => {
		entries[entries.length] = {
			name: memberKey(member),
			resolved: getStringMember(member.value, 'resolved'),
			line: nodeLine(member),
		};
	});

	return entries;
}

/** @type {(content: string) => EntryInfo[]} */
function extractFromYarnLockfile(content) {
	return parseYarnLockfile(content, ['resolved']).map(({
		name,
		resolved,
		line,
	}) => ({
		name: bareName(name),
		resolved,
		line,
	}));
}

/** @type {(filepath: string) => EntryInfo[]} */
function extractFromBunLockbBinary(filepath) {
	const yarnLockContent = loadBunLockbContent(filepath);
	if (!yarnLockContent) {
		return [];
	}
	return extractFromYarnLockfile(yarnLockContent);
}

// pnpm-lock.yaml, bun.lock, and vlt-lock.json record only an integrity hash (not
// a registry tarball URL) for registry dependencies, so there is no URL whose
// name could disagree with the key.
/** @type {() => EntryInfo[]} */
function extractNone() {
	return [];
}

const extracts = /** @type {const} */ ({
	__proto__: null,
	'package-lock.json': extractFromNpmLockfile,
	'npm-shrinkwrap.json': extractFromNpmLockfile,
	'yarn.lock': extractFromYarnLockfile,
	'pnpm-lock.yaml': extractNone,
	'bun.lock': extractNone,
	'bun.lockb': extractNone,
	'vlt-lock.json': extractNone,
});

/** @type {Rule.RuleModule} */
export default {
	meta: {
		type: 'problem',
		docs: {
			description: 'enforce that a package\'s resolved registry URL matches its name',
			// @ts-expect-error - `category` was removed from `RulesMetaDocs` in eslint@10 types but is still consumed by eslint-doc-generator
			category: 'Possible Errors',
			recommended: true,
			url: 'https://github.com/ljharb/lockfile-tools/blob/HEAD/packages/eslint-plugin/docs/rules/name-matches-resolved.md',
		},
		schema: [],
		messages: {
			mismatch: 'Package `{{name}}` in lockfile `{{filename}}` resolves to a tarball for a different package `{{urlName}}`: {{resolved}}',
			malformedLockfile: 'Lockfile "{{filename}}" is malformed: {{error}}',
		},
	},

	create(context) {
		const lockfiles = values(PACKAGE_MANAGERS).flatMap((pm) => pm.lockfiles);

		return {
			Program(node) {
				const dir = dirname(getContextFilename(context));
				const extractFromLockfile = createLockfileExtractor(
					extracts,
					extractFromBunLockbBinary,
					makeLockfileContentLoader(context, loadLockfileContent),
				);

				lockfiles.forEach((filename) => {
					/** @type {EntryInfo[]} */
					let entries;
					try {
						entries = extractFromLockfile(join(dir, filename));
					} catch (e) {
						context.report({
							node,
							messageId: 'malformedLockfile',
							data: {
								filename,
								error: e instanceof Error ? e.message : String(e),
							},
						});
						return;
					}

					entries.forEach(({
						name,
						resolved,
						line,
					}) => {
						if (!resolved) {
							return;
						}
						const urlName = registryTarballName(resolved);
						if (!urlName || !name || urlName === name) {
							return;
						}
						const loc = { start: { line, column: 0 }, end: { line, column: 0 } };
						context.report({
							node,
							loc,
							messageId: 'mismatch',
							data: {
								name,
								urlName,
								resolved,
								filename,
							},
						});
					});
				});
			},
		};
	},
};
