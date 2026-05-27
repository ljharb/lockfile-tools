import test from 'tape';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createESLint, eslintMajorVersion } from './helpers/eslint-compat.mjs';
import plugin from 'eslint-plugin-lockfile';

const skipOnV8 = eslintMajorVersion < 9
	? { skip: 'requires flat-config languageOptions.parser; not applicable to ESLint 8 legacy config' }
	: {};

test('recommended config - lints package-lock.json without parser error', skipOnV8, async (t) => {
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

		const eslint = createESLint(
			plugin.configs.recommended.map((block) => ({ ...block, plugins: { lockfile: plugin } })),
			tmpDir,
		);

		const results = await eslint.lintFiles(['package-lock.json']);

		const fatal = results.flatMap((r) => r.messages).filter((m) => m.fatal);
		t.deepEqual(fatal, [], 'no fatal/parsing errors on package-lock.json');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('recommended config - lints yarn.lock without parser error', skipOnV8, async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'yarn.lock'), '# yarn lockfile v1\n\nhas-flag@^4.0.0:\n  version "4.0.0"\n');

		const eslint = createESLint(
			plugin.configs.recommended.map((block) => ({ ...block, plugins: { lockfile: plugin } })),
			tmpDir,
		);

		const results = await eslint.lintFiles(['yarn.lock']);

		const fatal = results.flatMap((r) => r.messages).filter((m) => m.fatal);
		t.deepEqual(fatal, [], 'no fatal/parsing errors on yarn.lock');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('recommended config - lints pnpm-lock.yaml without parser error', skipOnV8, async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n");

		const eslint = createESLint(
			plugin.configs.recommended.map((block) => ({ ...block, plugins: { lockfile: plugin } })),
			tmpDir,
		);

		const results = await eslint.lintFiles(['pnpm-lock.yaml']);

		const fatal = results.flatMap((r) => r.messages).filter((m) => m.fatal);
		t.deepEqual(fatal, [], 'no fatal/parsing errors on pnpm-lock.yaml');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});
