import test from 'tape';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import plugin from 'eslint-plugin-lockfile';
import { createESLint } from './helpers/eslint-compat.mjs';

test('binary-conflicts rule - bun.lock text format returns empty (no version info)', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: {
			gulp: '^4.0.0',
		},
	}));
	// bun.lock text format doesn't have parseable version info
	const bunLock = `# bun lockfile v1

[gulp@^4.0.0]
version = "4.0.2"
resolved = "https://registry.yarnpkg.com/gulp/-/gulp-4.0.2.tgz"`;
	writeFileSync(join(tmpDir, 'bun.lock'), bunLock);
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	const eslint = createESLint({
		files: ['**/*.js'],
		plugins: { lockfile: plugin },
		rules: { 'lockfile/binary-conflicts': 'error' },
	}, tmpDir);

	const results = await eslint.lintFiles(['index.js']);
	t.equal(results[0].errorCount, 0, 'no errors - bun.lock text format cannot be parsed for bins yet');
	t.end();
});
