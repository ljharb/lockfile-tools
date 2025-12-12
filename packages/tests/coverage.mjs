import test from 'tape';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createESLint } from './helpers/eslint-compat.mjs';
import plugin from 'eslint-plugin-lockfile';

test('version rule - yarn v1 detection', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'yarn.lock'), '# yarn lockfile v1\n\npackage@1.0.0:\n  version "1.0.0"\n');
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/version': ['error', { yarn: 1 }],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors with yarn v1 when configured');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}
	t.end();
});

test('version rule - vlt version detection', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'vlt-lock.json'), JSON.stringify({ lockfileVersion: 0, packages: {} }));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/version': ['error', { vlt: 0 }],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors with vlt lockfile version');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}
	t.end();
});

test('version rule - unrecognized yarn format returns null', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'yarn.lock'), '# unrecognized format\npackage@1.0.0:\n  version "1.0.0"\n');
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/version': ['error', { yarn: 1 }],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		// Should not error because version detection returns null and is skipped
		t.equal(results[0].errorCount, 0, 'no errors when yarn version cannot be detected');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}
	t.end();
});

test('integrity rule - package without resolved URL reports errors', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		const lockfile = {
			lockfileVersion: 3,
			packages: {
				'node_modules/test-pkg': {
					version: '1.0.0',
					// No resolved URL - should report missing integrity and missing resolved
				},
			},
		};
		writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify(lockfile));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/integrity': 'error',
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 2, 'errors for missing integrity and missing resolved');
		const messages = results[0].messages.map((m) => m.message);
		t.ok(messages.some((m) => m.includes('missing') && m.includes('integrity')), 'error mentions missing integrity');
		t.ok(messages.some((m) => m.includes('missing') && m.includes('resolved')), 'error mentions missing resolved');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}
	t.end();
});

