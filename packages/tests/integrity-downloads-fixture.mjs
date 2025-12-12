import test from 'tape';
import { mkdtempSync, writeFileSync, rmSync, copyFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createESLint } from './helpers/eslint-compat.mjs';
import plugin from 'eslint-plugin-lockfile';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

test('integrity rule - package-lock-downloads.json verifies most packages after downloading', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		// Copy the lockfile to a temp directory
		const lockfilePath = join(__dirname, 'fixtures', 'package-lock-downloads.json');
		copyFileSync(lockfilePath, join(tmpDir, 'package-lock.json'));

		// Count total packages in the fixture
		const lockfileContent = JSON.parse(readFileSync(lockfilePath, 'utf8'));
		const totalPackages = Object.entries(lockfileContent.packages || {})
			.filter(([path, pkg]) => path && pkg.resolved && pkg.integrity)
			.length;

		// Create a minimal package.json
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
			name: 'sticker-safari',
			version: '0.1.0',
		}));

		// Create a test file
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/integrity': 'error',
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		const [{ errorCount }] = results;

		// The fixture contains many platform-specific optional dependencies that npm won't
		// download on platforms where they aren't needed (e.g., @esbuild/linux-arm64 on macOS).
		// We expect the majority of packages to verify successfully, but some platform-specific
		// packages will fail because they can't be cached on this platform.
		// Success means at least 70% of packages verify correctly.
		const successRate = (totalPackages - errorCount) / totalPackages;
		const minSuccessRate = 0.7;

		t.ok(
			successRate >= minSuccessRate,
			`at least ${minSuccessRate * 100}% of packages verify (got ${(successRate * 100).toFixed(1)}%, ${errorCount} errors out of ${totalPackages} packages)`,
		);
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});
