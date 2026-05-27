import { basename } from 'path';

/** @import { Rule, SourceCode } from 'eslint' */

/**
 * `getFilename`/`getSourceCode` were removed from `Rule.RuleContext`'s
 * declared types in eslint@10. They still exist at runtime on
 * eslint <= 8.39.x - where the modern `filename`/`sourceCode` getters
 * didn't yet exist - so the v8 fallback branch needs them. Centralize
 * the type cast here so consumers can `??` directly without sprinkling
 * `@type {unknown}` casts at every call site.
 * @typedef {Rule.RuleContext & { getFilename?(): string, getSourceCode?(): SourceCode }} LegacyRuleContext
 */

/**
 * @param {Rule.RuleContext} context
 * @returns {string}
 */
export function getContextFilename(context) {
	const ctx = /** @type {LegacyRuleContext} */ (context);
	return ctx.filename ?? /** @type {() => string} */ (ctx.getFilename)();
}

/**
 * @param {Rule.RuleContext} context
 * @returns {SourceCode}
 */
export function getContextSourceCode(context) {
	const ctx = /** @type {LegacyRuleContext} */ (context);
	return ctx.sourceCode ?? /** @type {() => SourceCode} */ (ctx.getSourceCode)();
}

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
 * directly - that keeps esmock-style test mocks intercepting at the rule
 * boundary effective.
 *
 * @param {Rule.RuleContext} context
 * @param {(filepath: string) => string | null} loadLockfileContent
 * @returns {(lockfilePath: string) => string | null}
 */
export function makeLockfileContentLoader(context, loadLockfileContent) {
	const currentBase = basename(getContextFilename(context));
	return function getLockfileContent(lockfilePath) {
		if (basename(lockfilePath) === 'bun.lockb') {
			return loadLockfileContent(lockfilePath);
		}
		if (basename(lockfilePath) === currentBase) {
			return getContextSourceCode(context).text;
		}
		return loadLockfileContent(lockfilePath);
	};
}
