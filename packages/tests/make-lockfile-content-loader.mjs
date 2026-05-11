import test from 'tape';
import { makeLockfileContentLoader } from '../eslint-plugin/utils.mjs';

/** @import { Rule } from 'eslint' */

/**
 * @param {string} filename
 * @param {string} text
 * @returns {Rule.RuleContext}
 */
function fakeContext(filename, text) {
	return /** @type {Rule.RuleContext} */ (/** @type {unknown} */ ({
		filename,
		sourceCode: { text },
	}));
}

test('makeLockfileContentLoader - returns sourceCode.text when basename matches', (t) => {
	const ctx = fakeContext('/some/dir/package-lock.json', 'PIPED');
	/** @type {string[]} */
	const calls = [];
	const get = makeLockfileContentLoader(ctx, (p) => {
		calls.push(p);
		return 'DISK';
	});

	t.equal(get('/some/dir/package-lock.json'), 'PIPED', 'returns piped content for matching basename');
	t.equal(get('/another/dir/package-lock.json'), 'PIPED', 'matches on basename, not full path');
	t.deepEqual(calls, [], 'disk loader is not invoked when basenames match');
	t.end();
});

test('makeLockfileContentLoader - falls back to disk loader when basename mismatches', (t) => {
	const ctx = fakeContext('/some/dir/package-lock.json', 'PIPED');
	/** @type {string[]} */
	const calls = [];
	const get = makeLockfileContentLoader(ctx, (p) => {
		calls.push(p);
		return 'DISK';
	});

	t.equal(get('/some/dir/yarn.lock'), 'DISK', 'reads sibling lockfile from disk');
	t.deepEqual(calls, ['/some/dir/yarn.lock'], 'disk loader received the sibling path');
	t.end();
});

test('makeLockfileContentLoader - bun.lockb always uses disk loader, never sourceCode', (t) => {
	// Even when the linted file IS bun.lockb, never use sourceCode (text-decoded
	// binary would be corrupted).
	const ctx = fakeContext('/some/dir/bun.lockb', 'CORRUPTED-TEXT');
	/** @type {string[]} */
	const calls = [];
	const get = makeLockfileContentLoader(ctx, (p) => {
		calls.push(p);
		return 'BINARY-CONTENT';
	});

	t.equal(get('/some/dir/bun.lockb'), 'BINARY-CONTENT', 'reads bun.lockb from disk even when linted file is bun.lockb');
	t.deepEqual(calls, ['/some/dir/bun.lockb'], 'disk loader was invoked');
	t.end();
});

test('makeLockfileContentLoader - returns null when disk loader returns null', (t) => {
	const ctx = fakeContext('/some/dir/index.js', 'JS-SOURCE');
	const get = makeLockfileContentLoader(ctx, () => null);

	t.equal(get('/some/dir/yarn.lock'), null, 'propagates null when sibling does not exist');
	t.end();
});

test('makeLockfileContentLoader - falls back to context.getFilename and getSourceCode (legacy ESLint)', (t) => {
	// On older ESLint where context.filename / context.sourceCode are not set
	// directly, the loader should call the legacy getter methods.
	const ctx = /** @type {Rule.RuleContext} */ (/** @type {unknown} */ ({
		filename: undefined,
		sourceCode: undefined,
		getFilename() { return '/legacy/dir/package-lock.json'; },
		getSourceCode() { return { text: 'LEGACY-PIPED' }; },
	}));

	const get = makeLockfileContentLoader(ctx, () => 'DISK');

	t.equal(get('/legacy/dir/package-lock.json'), 'LEGACY-PIPED', 'falls back to context.getFilename/getSourceCode');
	t.equal(get('/legacy/dir/yarn.lock'), 'DISK', 'sibling still goes to disk');
	t.end();
});

test('makeLockfileContentLoader - matches on basename when context filename is bare (no dir)', (t) => {
	// When the linted file's path is just a basename (no directory), the loader
	// should still match sibling lookups against that basename.
	const ctx = fakeContext('package-lock.json', 'PIPED-BARE');
	const get = makeLockfileContentLoader(ctx, () => 'DISK');

	t.equal(get('/abs/dir/package-lock.json'), 'PIPED-BARE', 'matches bare context basename against absolute sibling path');
	t.end();
});
