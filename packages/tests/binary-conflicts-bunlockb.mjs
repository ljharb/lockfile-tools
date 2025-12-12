import test from 'tape';
import { mkdtempSync, writeFileSync, rmSync, copyFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createESLint } from './helpers/eslint-compat.mjs';
import plugin from 'eslint-plugin-lockfile';

test('binary-conflicts rule - real bun.lockb with bins (line 285)', async (t) => {
	// Tests the successful path through extractPackageBinsFromBunLockbBinary
	// Line 285: return extractPackageBinsFromYarnLockfile(yarnLockContent, dir)
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
			'lockfile/binary-conflicts': 'error',
		},
	}, tmpDir);

	const results = await eslint.lintFiles(['index.js']);
	t.equal(results[0].errorCount, 0, 'no errors with real bun.lockb');

	t.end();
});
