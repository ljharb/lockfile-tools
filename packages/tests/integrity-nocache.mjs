import test from 'tape';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createESLint } from './helpers/eslint-compat.mjs';
import plugin from 'eslint-plugin-lockfile';

test('integrity rule - invalid integrity format (no algorithm prefix)', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 3,
		packages: {
			'': { name: 'test' },
			'node_modules/lodash': {
				version: '4.17.21',
				resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz',
				integrity: 'invalid-format', // Invalid - no algorithm prefix
			},
		},
	}));
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	const eslint = createESLint({
		files: ['**/*.js'],
		plugins: { lockfile: plugin },
		rules: { 'lockfile/integrity': 'error' },
	}, tmpDir);

	const results = await eslint.lintFiles(['index.js']);
	t.ok(results[0].errorCount > 0, 'error reported');
	t.ok(results[0].messages.some((m) => m.messageId === 'invalidIntegrity'), 'error for invalid integrity format');
	t.end();
});
