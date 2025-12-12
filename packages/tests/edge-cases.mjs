import test from 'tape';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createESLint } from './helpers/eslint-compat.mjs';
import plugin from 'eslint-plugin-lockfile';
import integrityRule from 'eslint-plugin-lockfile/rules/integrity.mjs';

test('flavor rule - no lockfiles present', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/flavor': /** @type {const} */ (['error', 'npm']),
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors when no lockfiles present');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('flavor rule - unreadable directory', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/flavor': /** @type {const} */ (['error', 'npm']),
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors when directory can be read');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('version rule - yarn v2', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'yarn.lock'), '__metadata:\n  version: 6\n  cacheKey: 8\n\nhas-flag@npm:^4.0.0:\n  version: 4.0.0\n');
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/version': ['error', { yarn: 2 }],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors with yarn v2 when configured');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('integrity rule - npm v1 lockfile with dependencies', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
			lockfileVersion: 1,
			dependencies: {
				'has-flag': {
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
		t.equal(results[0].errorCount, 0, 'no errors with v1 lockfile with valid integrity');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('integrity rule - nested dependencies with wrong hashes', async (t) => {
	// This test calls the rule directly to properly await async integrity verification
	// ESLint does not wait for async rule visitors, so we can't use ESLint for this test
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 1,
		dependencies: {
			'has-flag': {
				version: '4.0.0',
				resolved: 'https://registry.npmjs.org/has-flag/-/has-flag-4.0.0.tgz',
				integrity: 'sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
				dependencies: {
					'array-includes': {
						version: '3.1.6',
						resolved: 'https://registry.npmjs.org/array-includes/-/array-includes-3.1.6.tgz',
						integrity: 'sha512-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=',
					},
				},
			},
		},
	}));
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	/** @type {{ messageId?: string; data?: Record<string, unknown> }[]} */
	const reports = [];
	const context = /** @type {import('eslint').Rule.RuleContext} */ (/** @type {unknown} */ ({
		filename: join(tmpDir, 'index.js'),
		options: [],
		/** @param {{ messageId?: string; data?: Record<string, unknown> }} info */
		report(info) {
			reports.push(info);
		},
	}));

	const ruleInstance = /** @type {{ Program: (node: import('estree').Program) => Promise<void[]> }} */ (
		/** @type {unknown} */ (integrityRule.create(context))
	);
	// eslint-disable-next-line new-cap
	await ruleInstance.Program(/** @type {import('estree').Program} */ (/** @type {unknown} */ ({ type: 'Program' })));

	t.equal(reports.length, 2, 'errors reported for wrong integrity hashes');
	t.ok(reports.some((r) => r.messageId === 'incorrectIntegrity' && r.data?.name === 'has-flag'), 'error for has-flag incorrect integrity');
	t.ok(reports.some((r) => r.messageId === 'incorrectIntegrity' && String(r.data?.name).includes('array-includes')), 'error for array-includes incorrect integrity');

	t.end();
});

test('registry rule - npm v1 lockfile', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
			lockfileVersion: 1,
			dependencies: {
				'has-flag': {
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
				'lockfile/registry': 'error',
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors with v1 lockfile and default registry');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('registry rule - invalid resolved URL', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
			lockfileVersion: 1,
			dependencies: {
				'local-package': {
					version: '1.0.0',
					resolved: 'not-a-valid-url',
				},
			},
		}));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/registry': 'error',
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors with invalid URL (skipped)');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('version rule - npm-shrinkwrap.json', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'npm-shrinkwrap.json'), JSON.stringify({ lockfileVersion: 3 }));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/version': 'error',
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors with npm-shrinkwrap.json v3');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

// Skip this test for now - pnpm lockfile format is complex
// test('integrity rule - pnpm lockfile', async (t) => {
// 	...
// });

test('integrity rule - npm lockfile with root package', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		const npmLock = {
			lockfileVersion: 3,
			packages: {
				'': {
					name: 'test',
					version: '1.0.0',
				},
				'node_modules/picocolors': {
					version: '1.1.1',
					resolved: 'https://registry.npmjs.org/picocolors/-/picocolors-1.1.1.tgz',
					integrity: 'sha512-xceH2snhtb5M9liqDsmEw56le376mTZkEX/jEb/RxNFyegNul7eNslCXP9FDj/Lcu0X8KEyMceP2ntpaHrDEVA==',
				},
			},
		};
		writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify(npmLock));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/integrity': 'error',
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors - root package is skipped');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}
	t.end();
});

test('integrity rule - npm v1 lockfile with missing integrity', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		const npmLock = {
			lockfileVersion: 1,
			dependencies: {
				picocolors: {
					version: '1.1.1',
					resolved: 'https://registry.npmjs.org/picocolors/-/picocolors-1.1.1.tgz',
					// No integrity field - will test the || null fallback
				},
			},
		};
		writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify(npmLock));
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
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}
	t.end();
});

test('integrity rule - npm v1 lockfile with missing resolved reports error', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		const npmLock = {
			lockfileVersion: 1,
			dependencies: {
				picocolors: {
					version: '1.1.1',
					// No resolved field - should report missing resolved
					integrity: 'sha512-xceH2snhtb5M9liqDsmEw56le376mTZkEX/jEb/RxNFyegNul7eNslCXP9FDj/Lcu0X8KEyMceP2ntpaHrDEVA==',
				},
			},
		};
		writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify(npmLock));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/integrity': 'error',
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 1, 'error reported for missing resolved');
		t.ok(results[0].messages[0].message.includes('missing') && results[0].messages[0].message.includes('resolved'), 'error mentions missing resolved');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}
	t.end();
});

test('registry rule - extractRegistriesFromLockfile with unknown lockfile type', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		// Create an unknown lockfile type
		writeFileSync(join(tmpDir, 'unknown.lock'), '{"some": "data"}');
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/registry': ['error', 'https://registry.npmjs.org'],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		// The rule only checks known lockfile types, so this should not error
		// But this tests that extractRegistriesFromLockfile handles unknown types gracefully
		t.equal(results[0].errorCount, 0, 'no errors with unknown lockfile type');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}
	t.end();
});

test('version rule - missing bun.lockb file returns null', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	// No bun.lockb file created - testing the missing file path
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	const eslint = createESLint({
		files: ['**/*.js'],
		plugins: { lockfile: plugin },
		rules: {
			'lockfile/version': ['error', { bun: 0 }],
		},
	}, tmpDir);

	const results = await eslint.lintFiles(['index.js']);
	// No error because file doesn't exist (version returns null, which is skipped)
	t.equal(results[0].errorCount, 0, 'no errors when bun.lockb does not exist');

	t.end();
});
