import test from 'tape';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createESLint } from './helpers/eslint-compat.mjs';
import plugin from 'eslint-plugin-lockfile';

// Regression: prior to the noop parser, applying `lockfile.configs.recommended`
// directly to a non-JS lockfile crashed espree with `Unexpected token :` (JSON),
// `Unexpected token` (yarn-lock), etc. before any rule could fire.

test('recommended config - lints package-lock.json without parser error', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
			name: 'test',
			lockfileVersion: 3,
			requires: true,
			packages: {
				'': { name: 'test', version: '1.0.0' },
			},
		}));

		const eslint = createESLint({
			...plugin.configs.recommended,
			plugins: { lockfile: plugin },
		}, tmpDir);

		const results = await eslint.lintFiles(['package-lock.json']);

		const fatal = results.flatMap((r) => r.messages).filter((m) => m.fatal);
		t.deepEqual(fatal, [], 'no fatal/parsing errors on package-lock.json');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('recommended config - lints yarn.lock without parser error', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'yarn.lock'), '# yarn lockfile v1\n\nhas-flag@^4.0.0:\n  version "4.0.0"\n');

		const eslint = createESLint({
			...plugin.configs.recommended,
			plugins: { lockfile: plugin },
		}, tmpDir);

		const results = await eslint.lintFiles(['yarn.lock']);

		const fatal = results.flatMap((r) => r.messages).filter((m) => m.fatal);
		t.deepEqual(fatal, [], 'no fatal/parsing errors on yarn.lock');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('recommended config - lints pnpm-lock.yaml without parser error', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n");

		const eslint = createESLint({
			...plugin.configs.recommended,
			plugins: { lockfile: plugin },
		}, tmpDir);

		const results = await eslint.lintFiles(['pnpm-lock.yaml']);

		const fatal = results.flatMap((r) => r.messages).filter((m) => m.fatal);
		t.deepEqual(fatal, [], 'no fatal/parsing errors on pnpm-lock.yaml');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});
