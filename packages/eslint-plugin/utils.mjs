import { basename } from 'path';

/**
 * Strips the leading `node_modules/` from an npm v2/v3 lockfile package key,
 * so error messages display `@scope/pkg` instead of `node_modules/@scope/pkg`.
 * Internal `node_modules/` segments are preserved to keep nested-dependency
 * context visible (e.g. `@babel/core/node_modules/semver`).
 *
 * @param {string} key
 * @returns {string}
 */
export function stripNodeModulesPrefix(key) {
	const prefix = 'node_modules/';
	return key.startsWith(prefix) ? key.slice(prefix.length) : key;
}

/**
 * Builds a loader that returns the content of a given lockfile path,
 * preferring `sourceCode.text` when the path matches the file currently
 * being linted (so piped/in-memory content is honored), falling back to
 * `loadLockfileContent` for sibling lockfiles. Always falls back to
 * `loadLockfileContent` for binary `bun.lockb` since text-decoded stdin
 * would be corrupted.
 *
 * `loadLockfileContent` is taken as a parameter so callers can import it
 * directly — that keeps esmock-style test mocks intercepting at the rule
 * boundary effective.
 *
 * @param {import('eslint').Rule.RuleContext} context
 * @param {(filepath: string) => string | null} loadLockfileContent
 * @returns {(lockfilePath: string) => string | null}
 */
export function makeLockfileContentLoader(context, loadLockfileContent) {
	const currentFile = context.filename ?? context.getFilename();
	const currentBase = basename(currentFile);
	return function getLockfileContent(lockfilePath) {
		if (basename(lockfilePath) === 'bun.lockb') {
			return loadLockfileContent(lockfilePath);
		}
		if (basename(lockfilePath) === currentBase) {
			const sourceCode = context.sourceCode ?? context.getSourceCode();
			return sourceCode.text;
		}
		return loadLockfileContent(lockfilePath);
	};
}
