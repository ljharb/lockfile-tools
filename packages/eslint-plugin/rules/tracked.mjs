/*
This rule enforces that a project either tracks its lockfile in version control, or has none at all.

The goal is consistency: on any given project, everyone should be using the same lockfile, or no one
should be. A lockfile that exists on disk but is excluded from version control (via `.gitignore`) means
some contributors have it locally while others don't, which defeats the purpose of a lockfile.

So:
 - If a lockfile exists on disk, it must be tracked in version control. We approximate "tracked" by
   checking that it is not matched by any applicable `.gitignore` (via the `ignore` package).
 - If no lockfile exists, the package manager must be configured to not produce one (e.g. npm's
   `package-lock=false`), so that an ordinary install won't silently create an untracked lockfile.

Some package managers (yarn, vlt) have no option to disable lockfile generation. For those, only the
"must be tracked if present" half is enforced; there is nothing to require when the lockfile is absent.
*/

import { existsSync, readFileSync } from 'fs';
import {
	dirname, join, relative, sep,
} from 'path';
import ignore from 'ignore';
import { PACKAGE_MANAGERS } from 'lockfile-tools/package-managers';
import { getContextFilename } from '../utils.mjs';

const { keys } = Object;

/** @import { Rule } from 'eslint' */
/** @import { PackageManager } from 'lockfile-tools/lib/package-managers.d.mts' */

/** @typedef {{ display: string, isSet: (dir: string) => boolean }} DisableConfig */

/** @type {PackageManager[]} */
const pms = /** @type {PackageManager[]} */ (keys(PACKAGE_MANAGERS));

/**
 * Yields each directory from `startDir` upward, stopping (inclusively) at the
 * first directory that contains a `.git` entry (the repository root), or at the
 * filesystem root. Mirrors how git resolves `.gitignore` files: only those from
 * the file's directory up to the repository root apply.
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
		// stop (inclusively) at the repository root, or at the filesystem root
		if (existsSync(join(dir, '.git')) || parent === dir) {
			done = true;
		} else {
			dir = parent;
		}
	}
	return dirs;
}

/**
 * @param {string} filepath
 * @returns {string | null}
 */
function readFileSafe(filepath) {
	try {
		return readFileSync(filepath, 'utf8');
	} catch {
		return null;
	}
}

/**
 * Approximates "is this file tracked in version control" by checking whether it
 * is matched by any applicable `.gitignore`. A lockfile that git would ignore is
 * one that isn't shared with everyone on the project.
 * @param {string} fileDir - directory containing the lockfile
 * @param {string} filename - lockfile name
 * @returns {boolean}
 */
function isGitIgnored(fileDir, filename) {
	const fullPath = join(fileDir, filename);
	return ancestorDirs(fileDir).some((dir) => {
		const content = readFileSafe(join(dir, '.gitignore'));
		if (content === null) {
			return false;
		}
		// `dir` is always an ancestor of `fileDir`, so the lockfile is a descendant
		// and the relative path is a forward subpath. `ignore` expects a
		// forward-slash path relative to the `.gitignore`'s directory.
		const rel = relative(dir, fullPath).split(sep).join('/');
		return ignore().add(content).ignores(rel);
	});
}

/**
 * Returns the value of an ini-style `key` from the nearest `.npmrc` walking up
 * from `dir`, or `null` if no `.npmrc` defines it. Within a file, the last
 * definition wins (matching npm's own precedence).
 * @param {string} dir
 * @param {string} key
 * @returns {string | null}
 */
function npmrcValue(dir, key) {
	let found = null;
	ancestorDirs(dir).some((d) => {
		const content = readFileSafe(join(d, '.npmrc'));
		if (content === null) {
			return false;
		}
		content.split(/\r?\n/).forEach((rawLine) => {
			const line = rawLine.trim();
			if (line === '' || line.startsWith('#') || line.startsWith(';')) {
				return;
			}
			const eq = line.indexOf('=');
			if (eq === -1) {
				return;
			}
			if (line.slice(0, eq).trim() === key) {
				found = line.slice(eq + 1).trim();
			}
		});
		// stop at the first `.npmrc` that exists; closer files shadow farther ones
		return true;
	});
	return found;
}

/**
 * Whether the `package.json` in `dir` is marked `private: true`. Private
 * packages are typically applications (which should commit a lockfile);
 * non-private packages are typically published libraries (which should not).
 * @param {string} dir
 * @returns {boolean}
 */
function isPrivatePackage(dir) {
	try {
		return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).private === true;
	} catch {
		return false;
	}
}

/**
 * Returns true if the nearest `bunfig.toml` walking up from `dir` sets
 * `save = false` under the `[install.lockfile]` table.
 * @param {string} dir
 * @returns {boolean}
 */
function bunLockfileDisabled(dir) {
	let disabled = false;
	ancestorDirs(dir).some((d) => {
		const content = readFileSafe(join(d, 'bunfig.toml'));
		if (content === null) {
			return false;
		}
		let inSection = false;
		content.split(/\r?\n/).forEach((rawLine) => {
			const line = rawLine.replace(/#.*$/, '').trim();
			const header = line.match(/^\[(.+)\]$/);
			if (header) {
				inSection = header[1].trim() === 'install.lockfile';
				return;
			}
			if (inSection && (/^save\s*=\s*false$/).test(line)) {
				disabled = true;
			}
		});
		return true;
	});
	return disabled;
}

/** @type {{ [K in PackageManager]: DisableConfig | null }} */
const DISABLE_CONFIGS = {
	npm: {
		display: '`package-lock=false` in `.npmrc`',
		isSet: (dir) => npmrcValue(dir, 'package-lock') === 'false',
	},
	pnpm: {
		display: '`lockfile=false` in `.npmrc`',
		isSet: (dir) => npmrcValue(dir, 'lockfile') === 'false',
	},
	bun: {
		display: '`save = false` under `[install.lockfile]` in `bunfig.toml`',
		isSet: bunLockfileDisabled,
	},
	// yarn and vlt have no supported option to disable lockfile generation
	yarn: null,
	vlt: null,
};

/** @type {Rule.RuleModule} */
export default {
	meta: {
		type: 'problem',
		docs: {
			description: 'require lockfiles to be tracked in version control, or disabled in config',
			// @ts-expect-error - `category` was removed from `RulesMetaDocs` in eslint@10 types but is still consumed by eslint-doc-generator
			category: 'Possible Errors',
			recommended: true,
			url: 'https://github.com/ljharb/lockfile-tools/blob/HEAD/packages/eslint-plugin/docs/rules/tracked.md',
		},
		schema: [
			{
				oneOf: [
					{ type: 'string', enum: pms },
					{
						type: 'array',
						items: { type: 'string', enum: pms },
						uniqueItems: true,
					},
				],
			},
		],
		messages: {
			untrackedApp: 'Lockfile `{{filename}}` exists but is ignored by version control, so it is not shared with everyone on the project. This looks like an application (`private: true`), which should commit its lockfile: remove `{{filename}}` from `.gitignore` and commit it. (Alternatively, if no one should use a lockfile, delete it and set {{disable}}.)',
			untrackedPublished: 'Lockfile `{{filename}}` exists but is ignored by version control, so it is not shared with everyone on the project. This looks like a published package, which should not use a lockfile: delete `{{filename}}` and set {{disable}}. (Alternatively, if everyone should share it, remove it from `.gitignore` and commit it.)',
			untrackedNoDisable: 'Lockfile `{{filename}}` exists but is ignored by version control, so it is not shared with everyone on the project. Remove it from `.gitignore` and commit it ({{manager}} has no option to disable lockfile generation, so a tracked lockfile is required).',
			missingApp: 'No `{{manager}}` lockfile is present, and {{disable}} is not set. This looks like an application (`private: true`), which should commit a lockfile so everyone uses one. (Alternatively, if no one should use a lockfile, set {{disable}}.)',
			missingPublished: 'No `{{manager}}` lockfile is present, and {{disable}} is not set. This looks like a published package, which should not use a lockfile: set {{disable}}. (Alternatively, to require one for everyone, commit a lockfile.)',
		},
	},

	create(context) {
		/** @type {PackageManager | PackageManager[]} */
		const config = context.options[0] || 'npm';
		/** @type {PackageManager[]} */
		const managers = /** @type {PackageManager[]} */ ([]).concat(config);

		return {
			Program(node) {
				// Use context.filename if available (ESLint 8.40+), fall back to getFilename() for older versions
				const filename = getContextFilename(context);
				const dir = dirname(filename);
				const app = isPrivatePackage(dir);

				managers.forEach((manager) => {
					const { lockfiles } = PACKAGE_MANAGERS[manager];
					const present = lockfiles.filter((lockfile) => existsSync(join(dir, lockfile)));
					const disable = DISABLE_CONFIGS[manager];

					if (present.length > 0) {
						present.forEach((lockfile) => {
							if (!isGitIgnored(dir, lockfile)) {
								return;
							}
							if (disable) {
								context.report({
									node,
									messageId: app ? 'untrackedApp' : 'untrackedPublished',
									data: { filename: lockfile, disable: disable.display },
								});
							} else {
								context.report({
									node,
									messageId: 'untrackedNoDisable',
									data: { filename: lockfile, manager },
								});
							}
						});
					} else if (disable && !disable.isSet(dir)) {
						context.report({
							node,
							messageId: app ? 'missingApp' : 'missingPublished',
							data: { manager, disable: disable.display },
						});
					}
				});
			},
		};
	},
};
