/*
This rule flags package-manager configuration that disables the very integrity and
supply-chain guarantees the other rules (and the package managers themselves) rely on.

A lockfile's integrity hashes are only worth anything if the installer actually verifies them
over an authenticated transport; an allowlist of build-script packages is only worth anything if
it is not globally overridden. Settings like these quietly turn those protections off for everyone
on the project, so they belong in review:

  - `.npmrc` (npm / pnpm):
      - `strict-ssl=false`               - disables TLS certificate verification (MITM risk)
      - `verify-store-integrity=false`   - disables pnpm store-integrity verification
      - `dangerously-allow-all-builds=true` - lets every dependency run build scripts
  - `.yarnrc.yml` (yarn):
      - `checksumBehavior: ignore`       - disables package checksum verification
      - `enableStrictSsl: false`         - disables TLS certificate verification (MITM risk)

Config files are resolved by walking up from the package directory to the repository root (the
directory containing `.git`), matching how these tools resolve their own configuration.

This rule deliberately does *not* cover the lockfile-disabling settings (`package-lock=false`,
`lockfile=false`, bun's `save = false`) - those are the domain of the `tracked` rule.
*/

import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { getContextFilename } from '../utils.mjs';

/** @import { Rule } from 'eslint' */

/**
 * Yields each directory from `startDir` upward, stopping (inclusively) at the
 * first directory that contains a `.git` entry (the repository root), or at the
 * filesystem root - matching how these tools resolve their config files.
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
 * Parses the nearest `.npmrc` walking up from `dir` into a key/value map (later
 * definitions within the file win, matching npm). Returns an empty map if none.
 * @param {string} dir
 * @returns {Map<string, string>}
 */
function parseNearestNpmrc(dir) {
	/** @type {Map<string, string>} */
	const map = new Map();
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
			if (eq !== -1) {
				map.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim());
			}
		});
		// stop at the first `.npmrc` that exists; closer files shadow farther ones
		return true;
	});
	return map;
}

/**
 * Returns the content of the nearest `.yarnrc.yml` walking up from `dir`, or null.
 * @param {string} dir
 * @returns {string | null}
 */
function readNearestYarnrc(dir) {
	/** @type {string | null} */
	let result = null;
	ancestorDirs(dir).some((d) => {
		const content = readFileSafe(join(d, '.yarnrc.yml'));
		if (content === null) {
			return false;
		}
		result = content;
		return true;
	});
	return result;
}

/** @type {Rule.RuleModule} */
export default {
	meta: {
		type: 'problem',
		docs: {
			description: 'disallow configuration that weakens lockfile and install integrity guarantees',
			// @ts-expect-error - `category` was removed from `RulesMetaDocs` in eslint@10 types but is still consumed by eslint-doc-generator
			category: 'Possible Errors',
			recommended: true,
			url: 'https://github.com/ljharb/lockfile-tools/blob/HEAD/packages/eslint-plugin/docs/rules/no-weakening-config.md',
		},
		schema: [],
		messages: {
			npmStrictSsl: '`strict-ssl=false` in `.npmrc` disables TLS certificate verification for registry requests, allowing man-in-the-middle tampering. Remove it.',
			npmVerifyStoreIntegrity: '`verify-store-integrity=false` in `.npmrc` disables pnpm store-integrity verification, so corrupted or tampered store contents are not detected. Remove it.',
			npmDangerousBuilds: '`dangerously-allow-all-builds=true` in `.npmrc` lets every dependency run build/install scripts, defeating the build allowlist. Remove it and allow specific packages instead.',
			yarnChecksumBehavior: '`checksumBehavior: ignore` in `.yarnrc.yml` disables yarn\'s package checksum verification, so tampered packages are not detected. Remove it.',
			yarnStrictSsl: '`enableStrictSsl: false` in `.yarnrc.yml` disables TLS certificate verification, allowing man-in-the-middle tampering. Remove it.',
		},
	},

	create(context) {
		return {
			Program(node) {
				const dir = dirname(getContextFilename(context));

				const npmrc = parseNearestNpmrc(dir);
				if (npmrc.get('strict-ssl') === 'false') {
					context.report({ node, messageId: 'npmStrictSsl' });
				}
				if (npmrc.get('verify-store-integrity') === 'false') {
					context.report({ node, messageId: 'npmVerifyStoreIntegrity' });
				}
				if (npmrc.get('dangerously-allow-all-builds') === 'true') {
					context.report({ node, messageId: 'npmDangerousBuilds' });
				}

				const yarnrc = readNearestYarnrc(dir);
				if (yarnrc !== null) {
					if ((/^checksumBehavior:\s*["']?ignore["']?\s*$/m).test(yarnrc)) {
						context.report({ node, messageId: 'yarnChecksumBehavior' });
					}
					if ((/^enableStrictSsl:\s*false\s*$/m).test(yarnrc)) {
						context.report({ node, messageId: 'yarnStrictSsl' });
					}
				}
			},
		};
	},
};
