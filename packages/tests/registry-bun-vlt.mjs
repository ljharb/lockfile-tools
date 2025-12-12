import test from 'tape';
import { mkdtempSync, writeFileSync, rmSync, copyFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createESLint } from './helpers/eslint-compat.mjs';
import plugin from 'eslint-plugin-lockfile';

test('registry rule - bun.lock with allowed registry', async (t) => {
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
			'lockfile/registry': ['error', 'https://registry.npmjs.org'],
		},
	}, tmpDir);

	const results = await eslint.lintFiles(['index.js']);
	t.equal(results[0].errorCount, 0, 'no errors with bun.lock and allowed registry');

	t.end();
});

test('registry rule - vlt-lock.json with allowed registry', async (t) => {
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
			'lockfile/registry': ['error', 'https://registry.npmjs.org'],
		},
	}, tmpDir);

	const results = await eslint.lintFiles(['index.js']);
	t.equal(results[0].errorCount, 0, 'no errors with vlt-lock.json and allowed registry');

	t.end();
});

test('registry rule - real bun.lockb with allowed registry', async (t) => {
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
			'lockfile/registry': ['error', 'https://registry.npmjs.org'],
		},
	}, tmpDir);

	const results = await eslint.lintFiles(['index.js']);
	t.equal(results[0].errorCount, 0, 'no errors with real bun.lockb and allowed registry');

	t.end();
});
