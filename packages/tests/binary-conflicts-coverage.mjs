import test from 'tape';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createESLint } from './helpers/eslint-compat.mjs';
import plugin from 'eslint-plugin-lockfile';

test('binary-conflicts rule - malformed package-lock.json does not crash', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'package-lock.json'), '{"lockfileVersion": 3, "packages": {invalid json}}');
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: { 'lockfile/binary-conflicts': 'error' },
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.ok(results.length > 0, 'ESLint ran successfully');
		// Malformed lockfiles may report errors or be skipped - either is acceptable
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('binary-conflicts rule - npm v1 with scoped and nested dependencies', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
			name: 'test',
			dependencies: {
				'@babel/core': '^7.0.0',
			},
		}));
		writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
			lockfileVersion: 1,
			dependencies: {
				'@babel/core': {
					version: '7.24.0',
					resolved: 'https://registry.npmjs.org/@babel/core/-/core-7.24.0.tgz',
					dependencies: {
						'@babel/helper-compilation-targets': {
							version: '7.24.0',
							resolved: 'https://registry.npmjs.org/@babel/helper-compilation-targets/-/helper-compilation-targets-7.24.0.tgz',
						},
					},
				},
			},
		}));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: { 'lockfile/binary-conflicts': 'error' },
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors with scoped packages and nested dependencies');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('binary-conflicts rule - pnpm lockfile processes last package', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
			name: 'test',
			dependencies: {
				tape: '^5.0.0',
				eslint: '^8.0.0',
			},
		}));
		const pnpmLock = `lockfileVersion: '9.0'

packages:
  /tape@5.7.5:
    resolution: {integrity: sha512-xxx, tarball: https://registry.npmjs.org/tape/-/tape-5.7.5.tgz}
    engines: {node: '>=6'}

  /eslint@8.57.0:
    resolution: {integrity: sha512-yyy, tarball: https://registry.npmjs.org/eslint/-/eslint-8.57.0.tgz}
    engines: {node: ^12.22.0 || ^14.17.0 || >=16.0.0}`;

		writeFileSync(join(tmpDir, 'pnpm-lock.yaml'), pnpmLock);
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: { 'lockfile/binary-conflicts': 'error' },
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors with pnpm lockfile processing last package');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('binary-conflicts rule - vlt lockfile with valid nodes', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
			name: 'test',
			dependencies: {
				tape: '^5.0.0',
			},
		}));
		writeFileSync(join(tmpDir, 'vlt-lock.json'), JSON.stringify({
			nodes: {
				node1: ['5.7.5', 'tape', 'sha512-abc123'],
				node2: ['8.57.0', 'eslint', 'sha512-def456'],
			},
		}));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: { 'lockfile/binary-conflicts': 'error' },
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors with vlt lockfile with valid nodes');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('binary-conflicts rule - skips workspace packages with link: true', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
			name: 'test-monorepo',
			workspaces: ['packages/*'],
		}));
		// npm lockfile with workspace packages (link: true)
		writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
			lockfileVersion: 3,
			packages: {
				'': {
					name: 'test-monorepo',
					workspaces: ['packages/*'],
				},
				'node_modules/@myorg/tasks': {
					resolved: 'packages/tasks',
					link: true,
				},
				'packages/tasks': {
					name: '@myorg/tasks',
					version: '0.0.1',
				},
			},
		}));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: { 'lockfile/binary-conflicts': 'error' },
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		// Workspace packages should be skipped
		t.equal(results[0].errorCount, 0, 'no errors - workspace packages skipped');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});
