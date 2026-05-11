import test from 'tape';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createESLint, eslintMajorVersion } from './helpers/eslint-compat.mjs';
import plugin from 'eslint-plugin-lockfile';

// These tests verify that rules consume `sourceCode.text` for the file
// currently being linted, so piped/in-memory content (e.g. via `eslint
// --stdin --stdin-filename`) is honored even when the file does not
// exist on disk, and even when an on-disk version differs.

// The plugin's `recommended` config attaches a noop `languageOptions.parser`
// so non-JS lockfiles can be linted. Legacy (v8) config has no equivalent
// and falls through to espree, which fatals on JSON. Skip these on v8.
const skipOnV8 = eslintMajorVersion < 9
	? { skip: 'requires flat-config languageOptions.parser; not applicable to ESLint 8 legacy config' }
	: {};

test('version rule - reads piped lockfile content via lintText', skipOnV8, async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		// Note: package-lock.json does NOT exist on disk in tmpDir.

		const eslint = createESLint({
			...plugin.configs.recommended,
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/version': ['error', { npm: 3 }],
			},
		}, tmpDir);

		// Pipe a lockfile with the wrong version through lintText.
		const piped = JSON.stringify({ lockfileVersion: 2 });
		const results = await eslint.lintText(piped, {
			filePath: join(tmpDir, 'package-lock.json'),
		});

		const versionMsg = results[0].messages.find((m) => m.ruleId === 'lockfile/version');
		t.ok(versionMsg, 'version rule fired against piped content');
		t.ok(versionMsg && versionMsg.message.includes('version 2'), 'reports version from piped content, not disk');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('version rule - prefers piped content over on-disk version', skipOnV8, async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		// On disk: a v3 lockfile (would pass).
		writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3 }));

		const eslint = createESLint({
			...plugin.configs.recommended,
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/version': ['error', { npm: 3 }],
			},
		}, tmpDir);

		// Pipe a v2 lockfile - should be reported as wrong even though disk is v3.
		const piped = JSON.stringify({ lockfileVersion: 2 });
		const results = await eslint.lintText(piped, {
			filePath: join(tmpDir, 'package-lock.json'),
		});

		const versionMsg = results[0].messages.find((m) => m.ruleId === 'lockfile/version');
		t.ok(versionMsg, 'reports against piped content, not disk content');
		t.ok(versionMsg && versionMsg.message.includes('version 2'), 'piped v2 wins over on-disk v3');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('integrity rule - preserves internal node_modules/ for nested deps', skipOnV8, async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));

		const eslint = createESLint({
			...plugin.configs.recommended,
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/integrity': 'error',
			},
		}, tmpDir);

		const piped = JSON.stringify({
			name: 'test',
			lockfileVersion: 3,
			packages: {
				'': { name: 'test', version: '1.0.0' },
				'node_modules/@scope/parent/node_modules/nested-pkg': { version: '1.0.0' },
			},
		});
		const results = await eslint.lintText(piped, {
			filePath: join(tmpDir, 'package-lock.json'),
		});

		const integrityMsgs = results[0].messages.filter((m) => m.ruleId === 'lockfile/integrity');
		t.ok(
			integrityMsgs.some((m) => m.message.includes('@scope/parent/node_modules/nested-pkg')),
			'preserves internal node_modules/ to keep nested-dependency context',
		);
		t.notOk(
			integrityMsgs.some((m) => m.message.includes('node_modules/@scope/parent/node_modules/nested-pkg')),
			'still strips the leading node_modules/',
		);
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('integrity rule - reads piped lockfile content via lintText', skipOnV8, async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		// No lockfile on disk.

		const eslint = createESLint({
			...plugin.configs.recommended,
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/integrity': 'error',
			},
		}, tmpDir);

		// Pipe a lockfile with a package missing both `integrity` and `resolved`.
		const piped = JSON.stringify({
			name: 'test',
			lockfileVersion: 3,
			packages: {
				'': { name: 'test', version: '1.0.0' },
				'node_modules/missing-pkg': { version: '1.0.0' },
			},
		});
		const results = await eslint.lintText(piped, {
			filePath: join(tmpDir, 'package-lock.json'),
		});

		const integrityMsgs = results[0].messages.filter((m) => m.ruleId === 'lockfile/integrity');
		t.ok(integrityMsgs.length > 0, 'integrity rule fired against piped content');
		t.ok(
			integrityMsgs.some((m) => m.message.includes('missing-pkg')),
			'reports the package from piped content',
		);
		// Package name should not include the leading `node_modules/` prefix
		t.notOk(
			integrityMsgs.some((m) => m.message.includes('node_modules/missing-pkg')),
			'leading node_modules/ is stripped from reported package name',
		);
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});
