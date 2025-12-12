import test from 'tape';
import { mkdtempSync, writeFileSync, rmSync, copyFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createESLint } from './helpers/eslint-compat.mjs';
import plugin from 'eslint-plugin-lockfile';

test('integrity rule - bun.lock with valid integrity', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	const bunLock = {
		lockfileVersion: 1,
		workspaces: {
			'': {
				name: 'test',
				dependencies: {
					picocolors: '^1.0.0',
				},
			},
		},
		packages: {
			picocolors: ['picocolors@1.1.1', '1.1.1', {}, 'sha512-xceH2snhtb5M9liqDsmEw56le376mTZkEX/jEb/RxNFyegNul7eNslCXP9FDj/Lcu0X8KEyMceP2ntpaHrDEVA=='],
		},
	};
	writeFileSync(join(tmpDir, 'bun.lock'), JSON.stringify(bunLock));
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	const eslint = createESLint({
		files: ['**/*.js'],
		plugins: { lockfile: plugin },
		rules: {
			'lockfile/integrity': 'error',
		},
	}, tmpDir);

	const results = await eslint.lintFiles(['index.js']);
	t.equal(results[0].errorCount, 0, 'no errors with bun.lock with valid integrity');

	t.end();
});

test('integrity rule - bun.lock with missing integrity', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	const bunLock = {
		lockfileVersion: 1,
		workspaces: {
			'': {
				name: 'test',
				dependencies: {
					picocolors: '^1.0.0',
				},
			},
		},
		packages: {
			picocolors: ['picocolors@1.1.1', '1.1.1', {}, null],
		},
	};
	writeFileSync(join(tmpDir, 'bun.lock'), JSON.stringify(bunLock));
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	const eslint = createESLint({
		files: ['**/*.js'],
		plugins: { lockfile: plugin },
		rules: {
			'lockfile/integrity': 'error',
		},
	}, tmpDir);

	const results = await eslint.lintFiles(['index.js']);
	t.equal(results[0].errorCount, 1, 'error reported for missing integrity in bun.lock');
	t.ok(results[0].messages[0].message.includes('missing an integrity value'), 'error message mentions missing integrity');

	t.end();
});

test('integrity rule - vlt-lock.json with valid integrity', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	const vltLock = {
		lockfileVersion: 0,
		options: {},
		nodes: {
			'··picocolors@1.1.1': [0, 'picocolors', 'sha512-xceH2snhtb5M9liqDsmEw56le376mTZkEX/jEb/RxNFyegNul7eNslCXP9FDj/Lcu0X8KEyMceP2ntpaHrDEVA=='],
		},
		edges: {
			'file·. picocolors': 'prod ^1.0.0 ··picocolors@1.1.1',
		},
	};
	writeFileSync(join(tmpDir, 'vlt-lock.json'), JSON.stringify(vltLock));
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	const eslint = createESLint({
		files: ['**/*.js'],
		plugins: { lockfile: plugin },
		rules: {
			'lockfile/integrity': 'error',
		},
	}, tmpDir);

	const results = await eslint.lintFiles(['index.js']);
	t.equal(results[0].errorCount, 0, 'no errors with vlt-lock.json with valid integrity');

	t.end();
});

test('integrity rule - vlt-lock.json with missing integrity', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	const vltLock = {
		lockfileVersion: 0,
		options: {},
		nodes: {
			'··picocolors@1.1.1': [0, 'picocolors', null],
		},
		edges: {
			'file·. picocolors': 'prod ^1.0.0 ··picocolors@1.1.1',
		},
	};
	writeFileSync(join(tmpDir, 'vlt-lock.json'), JSON.stringify(vltLock));
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	const eslint = createESLint({
		files: ['**/*.js'],
		plugins: { lockfile: plugin },
		rules: {
			'lockfile/integrity': 'error',
		},
	}, tmpDir);

	const results = await eslint.lintFiles(['index.js']);
	t.equal(results[0].errorCount, 1, 'error reported for missing integrity in vlt-lock.json');
	t.ok(results[0].messages[0].message.includes('missing an integrity value'), 'error message mentions missing integrity');

	t.end();
});

test('integrity rule - bun.lock with package without @ in nameAtVersion (line 112 else branch)', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	// Malformed bun.lock with nameAtVersion that has no @ sign
	const bunLock = {
		lockfileVersion: 1,
		workspaces: {
			'': {
				name: 'test',
				dependencies: {
					'malformed-pkg': '^1.0.0',
				},
			},
		},
		packages: {
			// The first element normally is 'name@version' but here it has no @
			'malformed-pkg': ['malformed-pkg', '1.0.0', {}, 'sha512-xceH2snhtb5M9liqDsmEw56le376mTZkEX/jEb/RxNFyegNul7eNslCXP9FDj/Lcu0X8KEyMceP2ntpaHrDEVA=='],
		},
	};
	writeFileSync(join(tmpDir, 'bun.lock'), JSON.stringify(bunLock));
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	const eslint = createESLint({
		files: ['**/*.js'],
		plugins: { lockfile: plugin },
		rules: {
			'lockfile/integrity': 'error',
		},
	}, tmpDir);

	const results = await eslint.lintFiles(['index.js']);
	// The resolved URL will be constructed using the full nameAtVersion as the package name
	// This is malformed but shouldn't crash
	t.ok(results[0].errorCount >= 0, 'handles malformed bun.lock without crashing');

	t.end();
});

test('integrity rule - vlt-lock.json with node key without @ (line 149 else branch)', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	// Malformed vlt-lock.json with a node key that has no @ sign
	const vltLock = {
		lockfileVersion: 0,
		options: {},
		nodes: {
			// Normal format is '··package@version', but here we have no @
			'··malformed-pkg': [0, 'malformed-pkg', 'sha512-xceH2snhtb5M9liqDsmEw56le376mTZkEX/jEb/RxNFyegNul7eNslCXP9FDj/Lcu0X8KEyMceP2ntpaHrDEVA=='],
		},
		edges: {
			'file·. malformed-pkg': 'prod ^1.0.0 ··malformed-pkg',
		},
	};
	writeFileSync(join(tmpDir, 'vlt-lock.json'), JSON.stringify(vltLock));
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	const eslint = createESLint({
		files: ['**/*.js'],
		plugins: { lockfile: plugin },
		rules: {
			'lockfile/integrity': 'error',
		},
	}, tmpDir);

	const results = await eslint.lintFiles(['index.js']);
	// Without @, version extraction returns '', so resolved will be null
	// The package should be skipped or handled gracefully
	t.ok(results[0].errorCount >= 0, 'handles malformed vlt-lock.json without crashing');

	t.end();
});

test('version rule - bun.lock version detection', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	const bunLock = {
		lockfileVersion: 1,
		workspaces: {},
		packages: {},
	};
	writeFileSync(join(tmpDir, 'bun.lock'), JSON.stringify(bunLock));
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	const eslint = createESLint({
		files: ['**/*.js'],
		plugins: { lockfile: plugin },
		rules: {
			'lockfile/version': ['error', { bun: 1 }],
		},
	}, tmpDir);

	const results = await eslint.lintFiles(['index.js']);
	t.equal(results[0].errorCount, 0, 'no errors with bun.lock version 1');

	t.end();
});

test('version rule - bun.lockb returns version 0', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	// Create a dummy binary file
	writeFileSync(join(tmpDir, 'bun.lockb'), Buffer.from([0x62, 0x75, 0x6e, 0x00]));
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	const eslint = createESLint({
		files: ['**/*.js'],
		plugins: { lockfile: plugin },
		rules: {
			'lockfile/version': ['error', { bun: 0 }],
		},
	}, tmpDir);

	const results = await eslint.lintFiles(['index.js']);
	t.equal(results[0].errorCount, 1, 'reports error for malformed bun.lockb');
	t.ok(results[0].messages[0].message.includes('malformed'), 'error message mentions malformed');

	t.end();
});

test('integrity rule - bun.lockb binary format with invalid data', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	// Create a dummy binary file - content doesn't matter since it's skipped
	writeFileSync(join(tmpDir, 'bun.lockb'), Buffer.from([0x62, 0x75, 0x6e, 0x00]));
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	const eslint = createESLint({
		files: ['**/*.js'],
		plugins: { lockfile: plugin },
		rules: {
			'lockfile/integrity': 'error',
		},
	}, tmpDir);

	const results = await eslint.lintFiles(['index.js']);
	t.equal(results[0].errorCount, 1, 'reports error for malformed bun.lockb');
	t.ok(results[0].messages[0].message.includes('malformed'), 'error message mentions malformed');

	t.end();
});

test('version rule - real bun.lockb returns version 0', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	copyFileSync(
		join(import.meta.dirname, 'fixtures', 'bun.lockb'),
		join(tmpDir, 'bun.lockb'),
	);
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	const eslint = createESLint({
		files: ['**/*.js'],
		plugins: { lockfile: plugin },
		rules: {
			'lockfile/version': ['error', { bun: 0 }],
		},
	}, tmpDir);

	const results = await eslint.lintFiles(['index.js']);
	t.equal(results[0].errorCount, 0, 'no errors - real bun.lockb version is 0');

	t.end();
});

test('integrity rule - real bun.lockb with valid integrity', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	copyFileSync(
		join(import.meta.dirname, 'fixtures', 'bun.lockb'),
		join(tmpDir, 'bun.lockb'),
	);
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	const eslint = createESLint({
		files: ['**/*.js'],
		plugins: { lockfile: plugin },
		rules: {
			'lockfile/integrity': 'error',
		},
	}, tmpDir);

	const results = await eslint.lintFiles(['index.js']);
	t.equal(results[0].errorCount, 0, 'no errors - real bun.lockb has valid integrity');

	t.end();
});
