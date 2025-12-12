import test from 'tape';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createESLint } from './helpers/eslint-compat.mjs';
import plugin from 'eslint-plugin-lockfile';

test('non-registry-specifiers rule - vlt-lock.json returns empty (no resolved URLs)', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: {
			lodash: '^4.0.0',
		},
	}));
	// vlt lockfile uses nodes format without resolved URLs
	writeFileSync(join(tmpDir, 'vlt-lock.json'), JSON.stringify({
		nodes: {
			node1: ['4.17.21', 'lodash', 'sha512-abc123'],
		},
	}));
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	const eslint = createESLint({
		files: ['**/*.js'],
		plugins: { lockfile: plugin },
		rules: { 'lockfile/non-registry-specifiers': 'error' },
	}, tmpDir);

	const results = await eslint.lintFiles(['index.js']);
	t.equal(results[0].errorCount, 0, 'no errors - vlt lockfiles dont store resolved URLs');
	t.end();
});

test('non-registry-specifiers rule - npm lockfile with root package (key empty string)', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: {
			lodash: '^4.0.0',
		},
	}));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 3,
		packages: {
			'': {
				name: 'test',
				version: '1.0.0',
				// Root package has no resolved URL
			},
			'node_modules/lodash': {
				version: '4.17.21',
				resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz',
				integrity: 'sha512-test',
			},
		},
	}));
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	const eslint = createESLint({
		files: ['**/*.js'],
		plugins: { lockfile: plugin },
		rules: { 'lockfile/non-registry-specifiers': 'error' },
	}, tmpDir);

	const results = await eslint.lintFiles(['index.js']);
	t.equal(results[0].errorCount, 0, 'no errors - root package is skipped');
	t.end();
});

test('non-registry-specifiers rule - package without resolved field', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: {
			lodash: '^4.0.0',
		},
	}));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 3,
		packages: {
			'': {
				name: 'test',
			},
			'node_modules/lodash': {
				version: '4.17.21',
				// No resolved field
			},
		},
	}));
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	const eslint = createESLint({
		files: ['**/*.js'],
		plugins: { lockfile: plugin },
		rules: { 'lockfile/non-registry-specifiers': 'error' },
	}, tmpDir);

	const results = await eslint.lintFiles(['index.js']);
	t.equal(results[0].errorCount, 0, 'no errors when package has no resolved field');
	t.end();
});
