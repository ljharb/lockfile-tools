/*
This rule flags dependencies whose resolved version was published too recently - within a
configurable "cooldown" window.

The window immediately after a version is published is the highest-risk period for supply-chain
attacks: a compromised maintainer account or a malicious release is most dangerous before the
ecosystem (and automated scanners) have had time to notice and pull it. Refusing to adopt a
version until it has aged a little - the model pnpm's `minimumReleaseAge` setting implements -
sharply reduces exposure to "publish, get installed everywhere, get yanked hours later" worms.

The threshold (in minutes) is taken from this rule's option if given, otherwise from the
`minimum-release-age` setting in the nearest `.npmrc`, otherwise it defaults to one day.

This rule requires network access (or a warm npm cache): it asks the registry, via `pacote`, when
each version was published. It extracts the resolved name+version of every registry dependency from
each supported lockfile (npm, yarn, pnpm, bun, vlt); non-registry sources (git, tarball, file) are
skipped.
*/

import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import pacote from 'pacote';
import { PACKAGE_MANAGERS } from 'lockfile-tools/package-managers';
import { loadLockfileContent, loadBunLockbContent } from 'lockfile-tools/io';
import { forEachNpmPackagesMember, traverseDependenciesAST } from 'lockfile-tools/npm';
import { parseYarnLockfile, parsePnpmLockfile, createLockfileExtractor } from 'lockfile-tools/parsers';
import {
	parseJSON,
	getRootObject,
	getMember,
	getStringMember,
	memberKey,
	forEachMember,
	nodeLine,
} from 'lockfile-tools/json-ast';
import { makeLockfileContentLoader, getContextFilename } from '../utils.mjs';

const { values } = Object;

/** @import { Rule } from 'eslint' */
/** @import { Lockfile } from 'lockfile-tools/lib/package-managers.d.mts' */

const DEFAULT_MINUTES = 24 * 60; // one day
const MS_PER_MINUTE = 60 * 1000;

/** @typedef {{ name: string, version: string, line: number }} Candidate */

/** @type {(resolved: string) => boolean} */
function isRegistryTarball(resolved) {
	return (/^https?:\/\//).test(resolved) && resolved.includes('/-/');
}

/**
 * The package name after the final `node_modules/` (the leaf), so nested deps
 * resolve to the actual package and scoped names stay intact.
 * @type {(key: string) => string}
 */
function leafPackageName(key) {
	const marker = 'node_modules/';
	return key.slice(key.lastIndexOf(marker) + marker.length);
}

/**
 * Recovers the package name and version encoded in a registry tarball URL
 * (`{registry}/{name}/-/{unscoped}-{version}.tgz`), or `null` for non-registry
 * or unparseable URLs.
 * @type {(resolved: string) => { name: string, version: string } | null}
 */
function registryNameVersion(resolved) {
	/** @type {URL} */
	let url;
	try {
		url = new URL(resolved);
	} catch {
		return null;
	}
	const separatorIndex = url.pathname.indexOf('/-/');
	if ((url.protocol !== 'https:' && url.protocol !== 'http:') || separatorIndex === -1) {
		return null;
	}
	const segments = url.pathname.slice(0, separatorIndex).split('/').filter(Boolean);
	if (segments.length === 0) {
		return null;
	}
	const last = segments[segments.length - 1];
	const previous = segments[segments.length - 2];
	const name = previous && previous.startsWith('@') ? `${previous}/${last}` : last;
	const afterSeparator = url.pathname.slice(separatorIndex + 3);
	const file = afterSeparator.slice(afterSeparator.lastIndexOf('/') + 1).replace(/\.tgz$/, '');
	const prefix = `${name.slice(name.lastIndexOf('/') + 1)}-`;
	const version = file.startsWith(prefix) ? file.slice(prefix.length) : '';
	return version ? { name, version } : null;
}

/**
 * Splits a pnpm package key (`name@version`, optionally with a `(peer@x)` suffix)
 * into its name and version. Returns `null` if it has no `@version`.
 * @type {(key: string) => { name: string, version: string } | null}
 */
function parsePnpmKey(key) {
	const bare = key.replace(/\(.*\)$/, '');
	const match = bare.match(/^(@?[^@]+)@(.+)$/);
	return match ? { name: match[1], version: match[2] } : null;
}

/** @type {(content: string) => Candidate[]} */
function extractFromNpmLockfile(content) {
	/** @type {Candidate[]} */
	const candidates = [];
	const root = getRootObject(parseJSON(content));

	forEachNpmPackagesMember(getMember(root, 'packages'), (member, key) => {
		const resolved = getStringMember(member.value, 'resolved');
		const version = getStringMember(member.value, 'version');
		if (resolved && version && isRegistryTarball(resolved)) {
			candidates[candidates.length] = {
				name: leafPackageName(key), version, line: nodeLine(member),
			};
		}
	});

	// npm v1 `dependencies` are keyed by the bare package name (nested
	// recursively). Reuse the shared traversal, taking the leaf key from the
	// member node rather than its joined `parent/child` path so scoped names
	// stay intact.
	traverseDependenciesAST(getMember(root, 'dependencies'), (member) => {
		const resolved = getStringMember(member.value, 'resolved');
		const version = getStringMember(member.value, 'version');
		if (resolved && version && isRegistryTarball(resolved)) {
			candidates[candidates.length] = {
				name: memberKey(member), version, line: nodeLine(member),
			};
		}
	});

	return candidates;
}

/** @type {(content: string) => Candidate[]} */
function extractFromYarnLockfile(content) {
	/** @type {Candidate[]} */
	const candidates = [];
	parseYarnLockfile(content, ['resolved']).forEach(({ resolved, line }) => {
		const parsed = resolved && registryNameVersion(resolved);
		if (parsed) {
			candidates[candidates.length] = {
				name: parsed.name, version: parsed.version, line,
			};
		}
	});
	return candidates;
}

/** @type {(filepath: string) => Candidate[]} */
function extractFromBunLockbBinary(filepath) {
	const yarnLockContent = loadBunLockbContent(filepath);
	if (!yarnLockContent) {
		return [];
	}
	return extractFromYarnLockfile(yarnLockContent);
}

/** @type {(content: string) => Candidate[]} */
function extractFromPnpmLockfile(content) {
	/** @type {Candidate[]} */
	const candidates = [];
	parsePnpmLockfile(content).forEach((entry) => {
		// registry dependencies record an integrity hash and no tarball URL; git,
		// tarball, and file sources carry a tarball (or no integrity) and are skipped.
		if (!entry.integrity || entry.resolved) {
			return;
		}
		const parsed = parsePnpmKey(entry.name);
		if (parsed) {
			candidates[candidates.length] = {
				name: parsed.name, version: parsed.version, line: entry.line,
			};
		}
	});
	return candidates;
}

/** @type {(content: string) => Candidate[]} */
function extractFromBunLockfile(content) {
	/** @type {Candidate[]} */
	const candidates = [];
	// bun.lock `packages` entries are `<name>: [<name@version>, <version>, {meta}, <integrity>]`.
	forEachMember(getMember(getRootObject(parseJSON(content)), 'packages'), (member, key) => {
		if (member.value.type !== 'Array' || member.value.elements.length < 2) {
			return;
		}
		const versionEl = member.value.elements[1];
		if (versionEl.value.type === 'String') {
			candidates[candidates.length] = {
				name: key, version: versionEl.value.value, line: nodeLine(member),
			};
		}
	});
	return candidates;
}

/** @type {(content: string) => Candidate[]} */
function extractFromVltLockfile(content) {
	/** @type {Candidate[]} */
	const candidates = [];
	// vlt `nodes` entries are keyed `··<name>@<version>` with value `[_, <name>, <integrity>]`.
	forEachMember(getMember(getRootObject(parseJSON(content)), 'nodes'), (member, key) => {
		if (member.value.type !== 'Array' || member.value.elements.length < 2) {
			return;
		}
		const nameEl = member.value.elements[1];
		const atIndex = key.lastIndexOf('@');
		if (nameEl.value.type === 'String' && atIndex > 0) {
			candidates[candidates.length] = {
				name: nameEl.value.value, version: key.slice(atIndex + 1), line: nodeLine(member),
			};
		}
	});
	return candidates;
}

/** @type {{ [k in Lockfile]: (s: string) => Candidate[] }} */
const extracts = {
	// @ts-expect-error TS doesn't understand dunder proto
	__proto__: null,
	'package-lock.json': extractFromNpmLockfile,
	'npm-shrinkwrap.json': extractFromNpmLockfile,
	'yarn.lock': extractFromYarnLockfile,
	'pnpm-lock.yaml': extractFromPnpmLockfile,
	'bun.lock': extractFromBunLockfile,
	'bun.lockb': extractFromBunLockfile,
	'vlt-lock.json': extractFromVltLockfile,
};

/**
 * Yields each directory from `startDir` up to (inclusively) the repository root
 * (a directory containing `.git`) or the filesystem root.
 * @param {string} startDir
 * @returns {string[]}
 */
function ancestorDirs(startDir) {
	/** @type {string[]} */
	const dirs = [];
	let dir = startDir;
	let done = false;
	while (!done) {
		dirs.push(dir);
		const parent = dirname(dir);
		if (existsSync(join(dir, '.git')) || parent === dir) {
			done = true;
		} else {
			dir = parent;
		}
	}
	return dirs;
}

/**
 * Reads `minimum-release-age` (in minutes) from the nearest `.npmrc` walking up
 * from `dir`, or `null` if unset or not a finite number.
 * @param {string} dir
 * @returns {number | null}
 */
function configuredReleaseAge(dir) {
	/** @type {number | null} */
	let found = null;
	ancestorDirs(dir).some((d) => {
		/** @type {string} */
		let content;
		try {
			content = readFileSync(join(d, '.npmrc'), 'utf8');
		} catch {
			return false;
		}
		content.split(/\r?\n/).forEach((rawLine) => {
			const line = rawLine.trim();
			const eq = line.indexOf('=');
			if (eq !== -1 && line.slice(0, eq).trim() === 'minimum-release-age') {
				const value = Number(line.slice(eq + 1).trim());
				found = Number.isFinite(value) ? value : null;
			}
		});
		return true; // stop at the first `.npmrc`
	});
	return found;
}

/**
 * @param {unknown} option
 * @param {string} dir
 * @returns {number}
 */
function resolveThresholdMinutes(option, dir) {
	if (typeof option === 'number') {
		return option;
	}
	const configured = configuredReleaseAge(dir);
	return configured === null ? DEFAULT_MINUTES : configured;
}

/** @type {(ms: number) => string} */
function humanizeMs(ms) {
	const minutes = Math.round(ms / MS_PER_MINUTE);
	if (minutes < 60) {
		return `${minutes} minute(s)`;
	}
	const hours = Math.round(minutes / 60);
	return hours < 48 ? `${hours} hour(s)` : `${Math.round(hours / 24)} day(s)`;
}

/** @type {Rule.RuleModule} */
export default {
	meta: {
		type: 'problem',
		docs: {
			description: 'disallow dependencies whose version was published more recently than a minimum release age',
			// @ts-expect-error - `category` was removed from `RulesMetaDocs` in eslint@10 types but is still consumed by eslint-doc-generator
			category: 'Possible Errors',
			recommended: true,
			url: 'https://github.com/ljharb/lockfile-tools/blob/HEAD/packages/eslint-plugin/docs/rules/minimum-release-age.md',
		},
		schema: [
			{
				type: 'number',
				minimum: 0,
			},
		],
		messages: {
			tooNew: 'Package `{{name}}@{{version}}` in lockfile `{{filename}}` was published {{age}} ago, newer than the {{threshold}} minimum release age. Recently-published versions are the highest-risk window for supply-chain attacks; wait before adopting it, or pin a known-good version.',
			fetchFailed: 'Package `{{name}}` in lockfile `{{filename}}` could not be checked for release age: {{error}}',
			malformedLockfile: 'Lockfile "{{filename}}" is malformed: {{error}}',
		},
	},

	create(context) {
		const lockfiles = values(PACKAGE_MANAGERS).flatMap((pm) => pm.lockfiles);

		return {
			Program(node) {
				const dir = dirname(getContextFilename(context));
				const thresholdMs = resolveThresholdMinutes(context.options[0], dir) * MS_PER_MINUTE;
				const extractFromLockfile = createLockfileExtractor(
					extracts,
					extractFromBunLockbBinary,
					makeLockfileContentLoader(context, loadLockfileContent),
				);

				/**
				 * @param {string} filename
				 * @param {Candidate} candidate
				 * @returns {Promise<void>}
				 */
				async function checkAge(filename, candidate) {
					const {
						name, version, line,
					} = candidate;
					const loc = { start: { line, column: 0 }, end: { line, column: 0 } };
					/** @type {string | undefined} */
					let published;
					try {
						const packument = await pacote.packument(name, { cache: join(homedir(), '.npm', '_cacache') });
						// @ts-expect-error - pacote's published types omit the `time` map it returns at runtime
						published = packument.time?.[version];
					} catch (e) {
						context.report({
							node,
							loc,
							messageId: 'fetchFailed',
							data: {
								name, filename, error: e instanceof Error ? e.message : String(e),
							},
						});
						return;
					}
					if (!published) {
						return;
					}
					const ageMs = Date.now() - new Date(published).getTime();
					if (ageMs < thresholdMs) {
						context.report({
							node,
							loc,
							messageId: 'tooNew',
							data: {
								name,
								version,
								filename,
								age: humanizeMs(ageMs),
								threshold: humanizeMs(thresholdMs),
							},
						});
					}
				}

				return Promise.all(lockfiles.map((filename) => {
					/** @type {Candidate[]} */
					let candidates;
					try {
						candidates = extractFromLockfile(join(dir, filename));
					} catch (e) {
						context.report({
							node,
							messageId: 'malformedLockfile',
							data: { filename, error: e instanceof Error ? e.message : String(e) },
						});
						return Promise.resolve();
					}
					return Promise.all(candidates.map((candidate) => checkAge(filename, candidate))).then(() => {});
				})).then(() => {});
			},
		};
	},
};
