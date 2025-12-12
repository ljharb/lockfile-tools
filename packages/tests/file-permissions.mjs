import { mkdtempSync, writeFileSync, rmSync, chmodSync } from 'fs';
import { platform, tmpdir } from 'os';
import { join } from 'path';

import test from 'tape';

import { createESLint } from './helpers/eslint-compat.mjs';

import plugin from 'eslint-plugin-lockfile';

// Only run on Unix-like systems
const isUnix = platform() !== 'win32';

test(
	'flavor rule - unreadable directory triggers catch',
	{ skip: !isUnix && 'Skipping on Windows - chmod behaves differently' },
	async (t) => {
		const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: {} }));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		t.teardown(() => {
			try {
				chmodSync(tmpDir, 0o755);
			} catch {}
			rmSync(tmpDir, { recursive: true, force: true });
		});

		// Make directory unreadable (remove read permission)
		chmodSync(tmpDir, 0o000);

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/flavor': ['error', 'npm'],
			},
		}, tmpDir);
		// Restore permissions before trying to lint, since ESLint needs to read index.js
		chmodSync(tmpDir, 0o755);

		const results = await eslint.lintFiles(['index.js']);
		// Should not error - catch block handles the permission error
		t.equal(results[0].errorCount, 0, 'no errors when directory was temporarily unreadable');

		t.end();
	},
);

test(
	'integrity rule - unreadable lockfile triggers catch',
	{ skip: !isUnix && 'Skipping on Windows - chmod behaves differently' },
	async (t) => {
		const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
		const lockfilePath = join(tmpDir, 'package-lock.json');

		t.teardown(() => {
			try {
				chmodSync(lockfilePath, 0o644);
			} catch {}
			rmSync(tmpDir, { recursive: true, force: true });
		});

		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(lockfilePath, JSON.stringify({ lockfileVersion: 3, packages: {} }));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		// Make lockfile unreadable
		chmodSync(lockfilePath, 0o000);

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/integrity': 'error',
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		// Should not error - catch block handles the permission error
		t.equal(results[0].errorCount, 0, 'no errors when lockfile is unreadable');

		t.end();
	},
);

test(
	'registry rule - unreadable lockfile triggers catch',
	{ skip: !isUnix && 'Skipping on Windows - chmod behaves differently' },
	async (t) => {
		const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
		const lockfilePath = join(tmpDir, 'package-lock.json');

		t.teardown(() => {
			try {
				chmodSync(lockfilePath, 0o644);
			} catch {}
			rmSync(tmpDir, { recursive: true, force: true });
		});

		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(lockfilePath, JSON.stringify({ lockfileVersion: 3, packages: {} }));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		// Make lockfile unreadable
		chmodSync(lockfilePath, 0o000);

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/registry': ['error', 'https://registry.npmjs.org'],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		// Should not error - catch block handles the permission error
		t.equal(results[0].errorCount, 0, 'no errors when lockfile is unreadable');

		t.end();
	},
);

test(
	'version rule - catch block in Program when join fails',
	{ skip: !isUnix && 'Skipping on Windows - chmod behaves differently' },
	async (t) => {
		const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
		const lockfilePath = join(tmpDir, 'package-lock.json');

		t.teardown(() => {
			try {
				chmodSync(lockfilePath, 0o644);
			} catch {}
			rmSync(tmpDir, { recursive: true, force: true });
		});

		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(lockfilePath, JSON.stringify({ lockfileVersion: 3 }));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		// Make lockfile unreadable
		chmodSync(lockfilePath, 0o000);

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/version': ['error', { npm: 3 }],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		// Should not error - catch block handles the permission error
		t.equal(results[0].errorCount, 0, 'no errors when lockfile is unreadable');

		t.end();
	},
);
