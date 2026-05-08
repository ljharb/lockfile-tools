import test from 'tape';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createLockfileExtractor } from 'lockfile-tools/parsers';

test('createLockfileExtractor - default loader reads from disk', (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	const path = join(tmpDir, 'package-lock.json');
	writeFileSync(path, '{"lockfileVersion":3}');

	const extract = createLockfileExtractor({
		'package-lock.json': (/** @type {string} */ content) => [{ content }],
	});

	t.deepEqual(extract(path), [{ content: '{"lockfileVersion":3}' }], 'reads file content from disk');
	t.end();
});

test('createLockfileExtractor - custom loader is used when provided', (t) => {
	/** @type {string[]} */
	const calls = [];
	const extract = createLockfileExtractor(
		{ 'package-lock.json': (/** @type {string} */ content) => [content] },
		null,
		(filepath) => {
			calls.push(filepath);
			return '{"injected":true}';
		},
	);

	const result = extract('/nowhere/package-lock.json');
	t.deepEqual(calls, ['/nowhere/package-lock.json'], 'loader is invoked with the lockfile path');
	t.deepEqual(result, ['{"injected":true}'], 'extractor receives content from the loader');
	t.end();
});

test('createLockfileExtractor - empty content returns empty array', (t) => {
	const extract = createLockfileExtractor(
		{ 'package-lock.json': () => [{ shouldNotAppear: true }] },
		null,
		() => null,
	);

	t.deepEqual(extract('/nowhere/package-lock.json'), [], 'returns [] when loader returns null');
	t.deepEqual(
		createLockfileExtractor({ 'package-lock.json': () => [{ x: 1 }] }, null, () => '')('/x/package-lock.json'),
		[],
		'returns [] when loader returns empty string',
	);
	t.end();
});

test('createLockfileExtractor - bun.lockb bypasses content loader', (t) => {
	let loaderCalled = false;
	let bunCalled = false;
	const extract = createLockfileExtractor(
		{},
		(filepath) => {
			bunCalled = true;
			return [{ filepath }];
		},
		() => {
			loaderCalled = true;
			return 'should not be used';
		},
	);

	const result = extract('/nowhere/bun.lockb');
	t.notOk(loaderCalled, 'getContent loader is not invoked for bun.lockb');
	t.ok(bunCalled, 'bunLockbExtractor is invoked');
	t.deepEqual(result, [{ filepath: '/nowhere/bun.lockb' }], 'bun extractor receives the path');
	t.end();
});

test('createLockfileExtractor - extra args are forwarded to extractors', (t) => {
	const extract = createLockfileExtractor(
		{ 'package-lock.json': (/** @type {string} */ content, /** @type {unknown[]} */ ...rest) => ({ content, rest }) },
		null,
		() => 'CONTENT',
	);

	const out = extract('/x/package-lock.json', 'arg1', 42);
	t.deepEqual(out, { content: 'CONTENT', rest: ['arg1', 42] }, 'extra args reach the extractor');
	t.end();
});

test('createLockfileExtractor - extra args are forwarded to bunLockbExtractor', (t) => {
	const extract = createLockfileExtractor(
		{},
		(filepath, ...rest) => ({ filepath, rest }),
	);

	const out = extract('/x/bun.lockb', 'arg1', 42);
	t.deepEqual(out, { filepath: '/x/bun.lockb', rest: ['arg1', 42] }, 'extra args reach the bun extractor');
	t.end();
});
