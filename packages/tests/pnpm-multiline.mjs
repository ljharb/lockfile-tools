import test from 'tape';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createESLint } from './helpers/eslint-compat.mjs';
import plugin from 'eslint-plugin-lockfile';

test('registry rule - pnpm with disallowed registry should error', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		const pnpmLock = `lockfileVersion: 5.4

dependencies:
  picocolors: 1.1.1

packages:

  /picocolors/1.1.1:
    resolution: {integrity: sha512-xceH2snhtb5M9liqDsmEw56le376mTZkEX/jEb/RxNFyegNul7eNslCXP9FDj/Lcu0X8KEyMceP2ntpaHrDEVA==}
    engines: {node: ^14 || ^16 || >=18}
    tarball: https://registry.npmjs.org/picocolors/-/picocolors-1.1.1.tgz
    dev: false
`;
		writeFileSync(join(tmpDir, 'pnpm-lock.yaml'), pnpmLock);
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/registry': ['error', 'https://my-private-registry.com'],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 1, 'error reported for disallowed registry');
		t.ok(results[0].messages[0].message.includes('https://registry.npmjs.org'), 'error mentions the registry');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}
	t.end();
});

test('registry rule - pnpm with standalone tarball field', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		const pnpmLock = `lockfileVersion: 5.4

dependencies:
  picocolors: 1.1.1

packages:

  /picocolors/1.1.1:
    resolution: {integrity: sha512-xceH2snhtb5M9liqDsmEw56le376mTZkEX/jEb/RxNFyegNul7eNslCXP9FDj/Lcu0X8KEyMceP2ntpaHrDEVA==}
    engines: {node: ^14 || ^16 || >=18}
    tarball: https://registry.npmjs.org/picocolors/-/picocolors-1.1.1.tgz
    dev: false
`;
		writeFileSync(join(tmpDir, 'pnpm-lock.yaml'), pnpmLock);
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/registry': ['error', 'https://registry.npmjs.org'],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors with pnpm tarball on separate line');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}
	t.end();
});

test('registry rule - pnpm with invalid tarball URL triggers catch', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		const pnpmLock = `lockfileVersion: 5.4

dependencies:
  picocolors: 1.1.1

packages:

  /picocolors/1.1.1:
    resolution: {integrity: sha512-xceH2snhtb5M9liqDsmEw56le376mTZkEX/jEb/RxNFyegNul7eNslCXP9FDj/Lcu0X8KEyMceP2ntpaHrDEVA==}
    engines: {node: ^14 || ^16 || >=18}
    tarball: not-a-valid-url
    dev: false
`;
		writeFileSync(join(tmpDir, 'pnpm-lock.yaml'), pnpmLock);
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/registry': ['error', 'https://registry.npmjs.org'],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors - invalid URL is skipped');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}
	t.end();
});

test('integrity rule - pnpm with multi-line tarball format', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		const pnpmLock = `lockfileVersion: 5.4

dependencies:
  picocolors: 1.1.1

packages:

  /picocolors/1.1.1:
    integrity: sha512-xceH2snhtb5M9liqDsmEw56le376mTZkEX/jEb/RxNFyegNul7eNslCXP9FDj/Lcu0X8KEyMceP2ntpaHrDEVA==
    tarball: https://registry.npmjs.org/picocolors/-/picocolors-1.1.1.tgz
    dev: false
`;
		writeFileSync(join(tmpDir, 'pnpm-lock.yaml'), pnpmLock);
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/integrity': 'error',
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors with pnpm multi-line tarball');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}
	t.end();
});

test('integrity rule - pnpm with single-line resolution tarball', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		const pnpmLock = `lockfileVersion: 5.4

dependencies:
  picocolors: 1.1.1

packages:

  /picocolors/1.1.1:
    resolution: {integrity: sha512-xceH2snhtb5M9liqDsmEw56le376mTZkEX/jEb/RxNFyegNul7eNslCXP9FDj/Lcu0X8KEyMceP2ntpaHrDEVA==, tarball: https://registry.npmjs.org/picocolors/-/picocolors-1.1.1.tgz}
    dev: false
`;
		writeFileSync(join(tmpDir, 'pnpm-lock.yaml'), pnpmLock);
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/integrity': 'error',
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors with pnpm single-line resolution');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}
	t.end();
});

test('integrity rule - pnpm with multiple packages', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		const pnpmLock = `lockfileVersion: 5.4

dependencies:
  picocolors: 1.1.1
  ansi-styles: 6.2.1

packages:

  /ansi-styles/6.2.1:
    integrity: sha512-bN798gFfQX+viw3R7yrGWRqnrN2oRkEkUjjl4JNn4E8GxxbjtG3FbrEIIY3l8/hrwUwIeCZvi4QuOTP4MErVug==
    tarball: https://registry.npmjs.org/ansi-styles/-/ansi-styles-6.2.1.tgz
    engines: {node: '>=12'}
    dev: false

  /picocolors/1.1.1:
    integrity: sha512-xceH2snhtb5M9liqDsmEw56le376mTZkEX/jEb/RxNFyegNul7eNslCXP9FDj/Lcu0X8KEyMceP2ntpaHrDEVA==
    tarball: https://registry.npmjs.org/picocolors/-/picocolors-1.1.1.tgz
    engines: {node: ^14 || ^16 || >=18}
    dev: false
`;
		writeFileSync(join(tmpDir, 'pnpm-lock.yaml'), pnpmLock);
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/integrity': 'error',
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors with pnpm multiple packages');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}
	t.end();
});
