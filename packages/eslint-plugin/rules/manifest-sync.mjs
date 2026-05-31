/*
This rule enforces that a lockfile stays in sync with its sibling `package.json`.

A lockfile records the root package's declared dependency ranges, so the two should always agree.
When they drift - a dependency added to `package.json` without reinstalling, a range edited by
hand, or an entry injected into the lockfile that the manifest never declared - an install is no
longer reproducible from the manifest, and a tampered lockfile can pull in dependencies the
manifest never authorized.

This is the same invariant `npm ci` / `pnpm install --frozen-lockfile` enforce; surfacing it as a
lint rule catches the drift in review rather than only at install time. For each tracked dependency
type, it compares the ranges declared in `package.json` against those recorded in the lockfile and
reports missing, extraneous, and range-mismatched dependencies.

Supported lockfiles:
 - **npm** (`package-lock.json`, `npm-shrinkwrap.json`, v2/v3): the root (`packages[""]`) entry
   records `dependencies`, `devDependencies`, `optionalDependencies`, and `peerDependencies`.
 - **pnpm** (`pnpm-lock.yaml`): the root (`.`) importer records the `specifier` for each
   `dependencies`/`devDependencies`/`optionalDependencies` entry. (pnpm importers do not record
   `peerDependencies`, so those are not compared for pnpm.)
npm v1 lockfiles, yarn, bun, and vlt do not record the manifest ranges comparably and are skipped -
rely on their own frozen-install checks (`yarn install --immutable`) instead.
*/

import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import { PACKAGE_MANAGERS } from 'lockfile-tools/package-managers';
import { loadLockfileContent } from 'lockfile-tools/io';
import { createLockfileExtractor } from 'lockfile-tools/parsers';
import {
	parseJSON,
	getRootObject,
	getMember,
	forEachMember,
	nodeLine,
} from 'lockfile-tools/json-ast';
import { makeLockfileContentLoader, getContextFilename } from '../utils.mjs';

const { values, entries } = Object;

/** @import { AST, Rule } from 'eslint' */
/** @import { Lockfile } from 'lockfile-tools/lib/package-managers.d.mts' */

const NPM_DEP_TYPES = /** @type {const} */ (['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']);
const PNPM_DEP_TYPES = /** @type {const} */ (['dependencies', 'devDependencies', 'optionalDependencies']);

/** @typedef {{ range: string, line: number }} RangeInfo */
/** @typedef {{ anchorLine: number, deps: Map<string, Map<string, RangeInfo>> }} LockDeps */

/**
 * Extracts the dependency-range maps recorded in an npm v2/v3 lockfile's root
 * (`packages[""]`) entry. Returns `null` when there is no such root entry (e.g.
 * a v1 lockfile), signalling that the lockfile cannot be compared.
 * @type {(content: string) => LockDeps | null}
 */
function extractFromNpmLockfile(content) {
	const packagesNode = getMember(getRootObject(parseJSON(content)), 'packages');
	if (!packagesNode) {
		return null;
	}

	/** @type {LockDeps | null} */
	let result = null;
	forEachMember(packagesNode, (member, key) => {
		if (key !== '') {
			return;
		}
		/** @type {Map<string, Map<string, RangeInfo>>} */
		const deps = new Map();
		NPM_DEP_TYPES.forEach((depType) => {
			/** @type {Map<string, RangeInfo>} */
			const map = new Map();
			forEachMember(getMember(member.value, depType), (depMember, name) => {
				if (depMember.value.type === 'String') {
					map.set(
						name,
						{ range: depMember.value.value, line: nodeLine(depMember) },
					);
				}
			});
			deps.set(depType, map);
		});
		result = { anchorLine: nodeLine(member), deps };
	});
	return result;
}

/**
 * Extracts the declared `specifier` of each dependency in the root (`.`) importer
 * of a `pnpm-lock.yaml`. Returns `null` when there is no root importer. The format
 * is indentation-based (2-space steps): `importers:` → `.:` → `<depType>:` →
 * `<name>:` → `specifier:`.
 * @type {(content: string) => LockDeps | null}
 */
function extractFromPnpmLockfile(content) {
	/** @type {Map<string, Map<string, RangeInfo>>} */
	const deps = new Map(PNPM_DEP_TYPES.map((depType) => [depType, new Map()]));
	let section = '';
	let inRootImporter = false;
	let anchorLine = 0;
	/** @type {Map<string, RangeInfo> | null} */
	let depMap = null;
	let name = '';
	let nameLine = 0;

	content.split(/\r?\n/).forEach((rawLine, index) => {
		const text = rawLine.trim();
		if (text === '') {
			return;
		}
		const indent = rawLine.length - rawLine.replace(/^ +/, '').length;
		if (indent === 0) {
			section = text.replace(/:.*$/, '');
			inRootImporter = false;
		} else if (section === 'importers') {
			if (indent === 2) {
				inRootImporter = text === '.:';
				if (inRootImporter) {
					anchorLine = index + 1;
				}
				depMap = null;
			} else if (inRootImporter) {
				if (indent === 4) {
					depMap = deps.get(text.replace(/:$/, '')) ?? null;
				} else if (depMap) {
					if (indent === 6) {
						name = text.replace(/:$/, '').replace(/^['"]|['"]$/g, '');
						nameLine = index + 1;
					} else {
						const match = text.match(/^specifier:\s*(.+)$/);
						if (match) {
							depMap.set(name, { range: match[1].replace(/^['"]|['"]$/g, ''), line: nameLine });
						}
					}
				}
			}
		}
	});

	return anchorLine === 0 ? null : { anchorLine, deps };
}

/**
 * Extracts the dependency ranges from a bun.lock's root workspace
 * (`workspaces[""]`), which mirrors the manifest's dependency fields. Returns
 * `null` if there is no root workspace entry.
 * @type {(content: string) => LockDeps | null}
 */
function extractFromBunLockfile(content) {
	const wsRoot = getMember(getMember(getRootObject(parseJSON(content)), 'workspaces'), '');
	if (!wsRoot) {
		return null;
	}
	/** @type {Map<string, Map<string, RangeInfo>>} */
	const deps = new Map();
	PNPM_DEP_TYPES.forEach((depType) => {
		/** @type {Map<string, RangeInfo>} */
		const map = new Map();
		forEachMember(getMember(wsRoot, depType), (depMember, name) => {
			if (depMember.value.type === 'String') {
				map.set(name, { range: depMember.value.value, line: nodeLine(depMember) });
			}
		});
		deps.set(depType, map);
	});
	return { anchorLine: nodeLine(wsRoot), deps };
}

/**
 * Extracts the root project's declared specifiers from a vlt-lock.json's `edges`.
 * A root edge is keyed `file·. <name>` with value `<type> <specifier> <node>`,
 * where `<type>` is `prod`/`dev`/`optional` (peer edges are not compared).
 * Returns `null` if there are no `edges` or no root edges (so an unrecognized
 * format is skipped rather than mis-reported).
 * @type {(content: string) => LockDeps | null}
 */
function extractFromVltLockfile(content) {
	const edgesNode = getMember(getRootObject(parseJSON(content)), 'edges');
	if (!edgesNode) {
		return null;
	}
	/** @type {Map<string, Map<string, RangeInfo>>} */
	const deps = new Map([
		['dependencies', new Map()],
		['devDependencies', new Map()],
		['optionalDependencies', new Map()],
	]);
	// vlt edge types -> the manifest dependency field they populate; peer edges are not compared.
	const edgeTypeToDep = new Map([['prod', 'dependencies'], ['dev', 'devDependencies'], ['optional', 'optionalDependencies']]);
	let sawRoot = false;
	forEachMember(edgesNode, (member, key) => {
		const nameMatch = key.match(/^file·\. (.+)$/);
		if (!nameMatch || member.value.type !== 'String') {
			return;
		}
		sawRoot = true;
		const valueMatch = member.value.value.match(/^(\S+)\s+(\S+)/);
		if (!valueMatch) {
			return;
		}
		const depType = edgeTypeToDep.get(valueMatch[1]);
		const target = depType && deps.get(depType);
		if (target) {
			target.set(nameMatch[1], { range: valueMatch[2], line: nodeLine(member) });
		}
	});
	if (!sawRoot) {
		return null;
	}
	return { anchorLine: nodeLine(edgesNode), deps };
}

// npm v1, yarn, and bun.lockb (which decodes to yarn) do not record the manifest ranges comparably.
/** @type {() => LockDeps | null} */
function extractNone() {
	return null;
}

/** @type {{ [k in Lockfile]: (s: string) => s extends '__proto__' ? null : LockDeps | null }} */
const extracts = {
	// @ts-expect-error TS doesn't understand dunder proto
	__proto__: null,
	'package-lock.json': extractFromNpmLockfile,
	'npm-shrinkwrap.json': extractFromNpmLockfile,
	'yarn.lock': extractNone,
	'pnpm-lock.yaml': extractFromPnpmLockfile,
	'bun.lock': extractFromBunLockfile,
	'bun.lockb': extractNone,
	'vlt-lock.json': extractFromVltLockfile,
};

/**
 * Reads and parses the sibling `package.json`, or returns `null` if it is absent
 * or unparseable (nothing to compare against).
 * @param {string} dir
 * @returns {Record<string, unknown> | null}
 */
function readManifest(dir) {
	try {
		return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
	} catch {
		return null;
	}
}

/**
 * The dependency ranges declared under `depType` in the parsed `package.json`.
 * @param {Record<string, unknown>} manifest
 * @param {string} depType
 * @returns {Map<string, string>}
 */
function manifestRanges(manifest, depType) {
	/** @type {Map<string, string>} */
	const map = new Map();
	const deps = manifest[depType];
	if (deps && typeof deps === 'object') {
		entries(deps).forEach(([name, range]) => {
			if (typeof range === 'string') {
				map.set(name, range);
			}
		});
	}
	return map;
}

/** @type {(line: number) => AST.SourceLocation} */
function lineLoc(line) {
	return { start: { line, column: 0 }, end: { line, column: 0 } };
}

/** @type {Rule.RuleModule} */
export default {
	meta: {
		type: 'problem',
		docs: {
			description: 'enforce that a lockfile stays in sync with its package.json',
			// @ts-expect-error - `category` was removed from `RulesMetaDocs` in eslint@10 types but is still consumed by eslint-doc-generator
			category: 'Possible Errors',
			recommended: true,
			url: 'https://github.com/ljharb/lockfile-tools/blob/HEAD/packages/eslint-plugin/docs/rules/manifest-sync.md',
		},
		schema: [],
		messages: {
			missing: 'Dependency `{{name}}` (`{{range}}`) is declared in package.json `{{depType}}` but is missing from lockfile `{{filename}}` (the lockfile is out of sync; reinstall).',
			extraneous: 'Dependency `{{name}}` is recorded in lockfile `{{filename}}` `{{depType}}` but is not declared in package.json (the lockfile is out of sync; reinstall).',
			rangeMismatch: 'Dependency `{{name}}` is `{{manifestRange}}` in package.json but `{{lockRange}}` in lockfile `{{filename}}` `{{depType}}` (the lockfile is out of sync; reinstall).',
			malformedLockfile: 'Lockfile "{{filename}}" is malformed: {{error}}',
		},
	},

	create(context) {
		const lockfiles = values(PACKAGE_MANAGERS).flatMap((pm) => pm.lockfiles);

		return {
			Program(node) {
				const dir = dirname(getContextFilename(context));
				const manifest = readManifest(dir);
				if (!manifest) {
					return;
				}

				const extractLockDeps = createLockfileExtractor(
					extracts,
					null,
					makeLockfileContentLoader(context, loadLockfileContent),
					() => null,
				);

				lockfiles.forEach((filename) => {
					/** @type {LockDeps | null} */
					let lockDeps;
					try {
						lockDeps = extractLockDeps(join(dir, filename));
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
					if (!lockDeps) {
						return;
					}
					const { anchorLine, deps } = lockDeps;

					deps.forEach((locked, depType) => {
						const declared = manifestRanges(manifest, depType);

						declared.forEach((range, name) => {
							const lockedDep = locked.get(name);
							if (!lockedDep) {
								context.report({
									node,
									loc: lineLoc(anchorLine),
									messageId: 'missing',
									data: {
										name, range, depType, filename,
									},
								});
							} else if (lockedDep.range !== range) {
								context.report({
									node,
									loc: lineLoc(lockedDep.line),
									messageId: 'rangeMismatch',
									data: {
										name, manifestRange: range, lockRange: lockedDep.range, depType, filename,
									},
								});
							}
						});

						locked.forEach((lockedDep, name) => {
							if (!declared.has(name)) {
								context.report({
									node,
									loc: lineLoc(lockedDep.line),
									messageId: 'extraneous',
									data: {
										name, depType, filename,
									},
								});
							}
						});
					});
				});
			},
		};
	},
};
