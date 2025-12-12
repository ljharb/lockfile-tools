import test from 'tape';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createESLint } from './helpers/eslint-compat.mjs';
import plugin from 'eslint-plugin-lockfile';

test('integrity rule - valid integrity passes', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
			lockfileVersion: 3,
			packages: {
				'node_modules/has-flag': {
					version: '4.0.0',
					resolved: 'https://registry.npmjs.org/has-flag/-/has-flag-4.0.0.tgz',
					integrity: 'sha512-EykJT/Q1KjTWctppgIAgfSO0tKVuZUjhgMr17kqTumMl6Afv3EISleU7qZUzoXDFTAHTDC4NOoG/ZxU3EvlMPQ==',
				},
			},
		}));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/integrity': 'error',
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors with valid integrity');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('integrity rule - missing integrity reports error', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
			lockfileVersion: 3,
			packages: {
				'node_modules/has-flag': {
					version: '4.0.0',
					resolved: 'https://registry.npmjs.org/has-flag/-/has-flag-4.0.0.tgz',
				},
			},
		}));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/integrity': 'error',
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 1, 'error reported for missing integrity');
		t.ok(results[0].messages[0].message.includes('missing'), 'error mentions missing integrity');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('integrity rule - real-world missing integrity and resolved (eslint-plugin-no-only-tests)', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		// Real lockfile snippet - package with no resolved URL and no integrity
		writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
			lockfileVersion: 3,
			packages: {
				'node_modules/eslint-plugin-no-only-tests': {
					version: '3.1.0',
					dev: true,
					license: 'MIT',
					engines: {
						node: '>=5.0.0',
					},
				},
			},
		}));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/integrity': 'error',
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 2, 'two errors reported (missing integrity and missing resolved)');
		const messages = results[0].messages.map((m) => m.message);
		t.ok(messages.some((m) => m.includes('eslint-plugin-no-only-tests') && m.includes('missing') && m.includes('integrity')), 'error mentions missing integrity');
		t.ok(messages.some((m) => m.includes('eslint-plugin-no-only-tests') && m.includes('missing') && m.includes('resolved')), 'error mentions missing resolved');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('integrity rule - invalid integrity format reports error', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
			lockfileVersion: 3,
			packages: {
				'node_modules/has-flag': {
					version: '4.0.0',
					resolved: 'https://registry.npmjs.org/has-flag/-/has-flag-4.0.0.tgz',
					integrity: 'invalid-format',
				},
			},
		}));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/integrity': 'error',
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 1, 'error reported for invalid integrity format');
		t.ok(results[0].messages[0].message.includes('invalid'), 'error mentions invalid integrity');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('integrity rule - yarn lockfile with integrity', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'yarn.lock'), `# yarn lockfile v1

has-flag@^4.0.0:
  version "4.0.0"
  resolved "https://registry.yarnpkg.com/has-flag/-/has-flag-4.0.0.tgz#944771fd9c81c81265c4d6941860da06bb59479b"
  integrity sha512-EykJT/Q1KjTWctppgIAgfSO0tKVuZUjhgMr17kqTumMl6Afv3EISleU7qZUzoXDFTAHTDC4NOoG/ZxU3EvlMPQ==
`);
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/integrity': 'error',
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors with yarn lockfile with valid integrity');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('integrity rule - yarn lockfile missing integrity', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'yarn.lock'), `# yarn lockfile v1

has-flag@^4.0.0:
  version "4.0.0"
  resolved "https://registry.yarnpkg.com/has-flag/-/has-flag-4.0.0.tgz#944771fd9c81c81265c4d6941860da06bb59479b"
`);
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/integrity': 'error',
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 1, 'error reported for missing integrity in yarn lockfile');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('integrity rule - skips non-registry packages', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
			lockfileVersion: 3,
			packages: {
				'node_modules/local-pkg': {
					version: '1.0.0',
					resolved: 'file:../local-pkg',
				},
			},
		}));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/integrity': 'error',
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors for non-registry packages without integrity');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('integrity rule - yarn lockfile with multiple packages', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		const yarnLock = `# This is an autogenerated file

ansi-styles@^6.0.0:
  version "6.2.1"
  resolved "https://registry.yarnpkg.com/ansi-styles/-/ansi-styles-6.2.1.tgz#0123456789abcdef"
  integrity sha512-bN798gFfQX+viw3R7yrGWRqnrN2oRkEkUjjl4JNn4E8GxxbjtG3FbrEIIY3l8/hrwUwIeCZvi4QuOTP4MErVug==

picocolors@^1.0.0:
  version "1.1.1"
  resolved "https://registry.yarnpkg.com/picocolors/-/picocolors-1.1.1.tgz#fedcba9876543210"
  integrity sha512-xceH2snhtb5M9liqDsmEw56le376mTZkEX/jEb/RxNFyegNul7eNslCXP9FDj/Lcu0X8KEyMceP2ntpaHrDEVA==
`;
		writeFileSync(join(tmpDir, 'yarn.lock'), yarnLock);
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/integrity': 'error',
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors with yarn lockfile with multiple packages');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}
	t.end();
});

test('integrity rule - disallowed hashing algorithm', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
			lockfileVersion: 3,
			packages: {
				'node_modules/example': {
					version: '1.0.0',
					resolved: 'https://registry.npmjs.org/example/-/example-1.0.0.tgz',
					integrity: 'sha1-AAAAAAAAAAAAAAAAAAA=',
				},
			},
		}));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/integrity': ['error', ['sha256', 'sha384', 'sha512']],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 1, 'error reported for disallowed algorithm');
		t.ok(results[0].messages[0].message.includes('sha1'), 'error mentions sha1');
		t.ok(results[0].messages[0].message.includes('sha256'), 'error mentions allowed algorithms');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('integrity rule - allowed hashing algorithm with wrong hash', async (t) => {
	// This test calls the rule directly to properly await async integrity verification
	// ESLint does not wait for async rule visitors, so we can't use ESLint for this test
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	// Use has-flag@4.0.0 which exists on npm, but with a wrong integrity hash
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 3,
		packages: {
			'node_modules/has-flag': {
				version: '4.0.0',
				resolved: 'https://registry.npmjs.org/has-flag/-/has-flag-4.0.0.tgz',
				// Wrong integrity hash (correct would be sha512-EykJT/Q1KjTWctppgIAgfSO0tKVuZUjhgMr17kqTumMl6Afv3EISleU7qZUzoXDFTAHTDC4NOoG/ZxU3EvlMPQ==)
				integrity: 'sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
			},
		},
	}));
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	/** @type {{ messageId?: string; data?: Record<string, unknown> }[]} */
	const reports = [];
	const context = /** @type {import('eslint').Rule.RuleContext} */ (/** @type {unknown} */ ({
		filename: join(tmpDir, 'index.js'),
		options: [['sha512']], // Only allow sha512
		/** @param {{ messageId?: string; data?: Record<string, unknown> }} info */
		report(info) {
			reports.push(info);
		},
	}));

	const integrityRuleModule = (await import('eslint-plugin-lockfile/rules/integrity.mjs')).default;
	const ruleInstance = /** @type {{ Program: (node: import('estree').Program) => Promise<void[]> }} */ (
		/** @type {unknown} */ (integrityRuleModule.create(context))
	);
	// eslint-disable-next-line new-cap
	await ruleInstance.Program(/** @type {import('estree').Program} */ (/** @type {unknown} */ ({ type: 'Program' })));

	// Package will be downloaded and verified, errors reported for incorrect hash
	t.equal(reports.length, 1, 'error for incorrect hash, but not for algorithm');
	t.equal(reports[0].messageId, 'incorrectIntegrity', 'error is about incorrect hash');

	t.end();
});
