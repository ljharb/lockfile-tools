import test from 'tape';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createESLint } from './helpers/eslint-compat.mjs';
import plugin from 'eslint-plugin-lockfile';

test('integrity rule - malformed vlt-lock.json triggers catch block', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	// Write malformed JSON to trigger catch block in extractPackagesFromVltLockfile
	writeFileSync(join(tmpDir, 'vlt-lock.json'), '{invalid json here}');
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	const eslint = createESLint({
		files: ['**/*.js'],
		plugins: { lockfile: plugin },
		rules: {
			'lockfile/integrity': 'error',
		},
	}, tmpDir);

	const results = await eslint.lintFiles(['index.js']);
	t.equal(results[0].errorCount, 1, 'reports error for malformed lockfile');
	t.ok(results[0].messages[0].message.includes('malformed'), 'error message mentions malformed');

	t.end();
});

test('integrity rule - malformed bun.lock triggers catch block', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	// Write malformed JSON to trigger catch block in extractPackagesFromBunLockfile
	writeFileSync(join(tmpDir, 'bun.lock'), '{"lockfileVersion": 1, "packages": {broken}}');
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	const eslint = createESLint({
		files: ['**/*.js'],
		plugins: { lockfile: plugin },
		rules: {
			'lockfile/integrity': 'error',
		},
	}, tmpDir);

	const results = await eslint.lintFiles(['index.js']);
	t.equal(results[0].errorCount, 1, 'reports error for malformed lockfile');
	t.ok(results[0].messages[0].message.includes('malformed'), 'error message mentions malformed');

	t.end();
});

test('integrity rule - malformed npm lockfile triggers catch block', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	// Write malformed JSON to trigger catch block in extractPackagesFromNpmLockfile
	writeFileSync(join(tmpDir, 'package-lock.json'), '{"lockfileVersion": 3, "packages": {broken}}');
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	const eslint = createESLint({
		files: ['**/*.js'],
		plugins: { lockfile: plugin },
		rules: {
			'lockfile/integrity': 'error',
		},
	}, tmpDir);

	const results = await eslint.lintFiles(['index.js']);
	t.equal(results[0].errorCount, 1, 'reports error for malformed lockfile');
	t.ok(results[0].messages[0].message.includes('malformed'), 'error message mentions malformed');

	t.end();
});

test('registry rule - malformed vlt-lock.json triggers catch block', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	// Write malformed JSON to trigger catch block in extractRegistriesFromVltLockfile
	writeFileSync(join(tmpDir, 'vlt-lock.json'), 'not valid json');
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	const eslint = createESLint({
		files: ['**/*.js'],
		plugins: { lockfile: plugin },
		rules: {
			'lockfile/registry': ['error', 'https://registry.npmjs.org'],
		},
	}, tmpDir);

	const results = await eslint.lintFiles(['index.js']);
	t.equal(results[0].errorCount, 1, 'reports error for malformed lockfile');
	t.ok(results[0].messages[0].message.includes('malformed'), 'error message mentions malformed');

	t.end();
});

test('registry rule - malformed npm lockfile triggers catch block', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	// Write malformed JSON to trigger catch block in extractRegistriesFromNpmLockfile
	writeFileSync(join(tmpDir, 'package-lock.json'), '{"lockfileVersion": 3, "packages": {broken}}');
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	const eslint = createESLint({
		files: ['**/*.js'],
		plugins: { lockfile: plugin },
		rules: {
			'lockfile/registry': ['error', 'https://registry.npmjs.org'],
		},
	}, tmpDir);

	const results = await eslint.lintFiles(['index.js']);
	t.equal(results[0].errorCount, 1, 'reports error for malformed lockfile');
	t.ok(results[0].messages[0].message.includes('malformed'), 'error message mentions malformed');

	t.end();
});

test('version rule - malformed bun.lock triggers catch in getLockfileVersion', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	// Write malformed JSON to trigger catch block in getLockfileVersion for bun
	writeFileSync(join(tmpDir, 'bun.lock'), '{malformed: json}');
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	const eslint = createESLint({
		files: ['**/*.js'],
		plugins: { lockfile: plugin },
		rules: {
			'lockfile/version': ['error', { bun: 1 }],
		},
	}, tmpDir);

	const results = await eslint.lintFiles(['index.js']);
	// Malformed JSON is caught and reported as an ESLint error
	t.equal(results[0].errorCount, 1, 'reports error for malformed lockfile');
	t.ok(results[0].messages[0].message.includes('malformed'), 'error message mentions malformed');

	t.end();
});

test('version rule - malformed npm lockfile triggers catch', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	// Write malformed JSON to trigger catch block in getLockfileVersion for npm
	writeFileSync(join(tmpDir, 'package-lock.json'), 'invalid json content');
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	const eslint = createESLint({
		files: ['**/*.js'],
		plugins: { lockfile: plugin },
		rules: {
			'lockfile/version': ['error', { npm: 3 }],
		},
	}, tmpDir);

	const results = await eslint.lintFiles(['index.js']);
	// Malformed JSON is caught and reported as an ESLint error
	t.equal(results[0].errorCount, 1, 'reports error for malformed lockfile');
	t.ok(results[0].messages[0].message.includes('malformed'), 'error message mentions malformed');

	t.end();
});

test('integrity rule - pnpm lockfile with valid integrity', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	// Create a minimal pnpm-lock.yaml with integrity
	const pnpmLock = `lockfileVersion: '6.0'

dependencies:
  picocolors:
    specifier: ^1.0.0
    version: 1.1.1

packages:

  /picocolors@1.1.1:
    resolution: {integrity: sha512-xceH2snhtb5M9liqDsmEw56le376mTZkEX/jEb/RxNFyegNul7eNslCXP9FDj/Lcu0X8KEyMceP2ntpaHrDEVA==}
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
	t.equal(results[0].errorCount, 0, 'no errors with pnpm-lock.yaml with valid integrity');

	t.end();
});

test('registry rule - pnpm lockfile with allowed registry', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	// Create a minimal pnpm-lock.yaml
	const pnpmLock = `lockfileVersion: '6.0'

dependencies:
  picocolors:
    specifier: ^1.0.0
    version: 1.1.1

packages:

  /picocolors@1.1.1:
    resolution: {integrity: sha512-xceH2snhtb5M9liqDsmEw56le376mTZkEX/jEb/RxNFyegNul7eNslCXP9FDj/Lcu0X8KEyMceP2ntpaHrDEVA==, tarball: https://registry.npmjs.org/picocolors/-/picocolors-1.1.1.tgz}
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
	t.equal(results[0].errorCount, 0, 'no errors with pnpm-lock.yaml and allowed registry');

	t.end();
});

test('version rule - missing lockfile file', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	// No lockfile created - tests the path where file doesn't exist
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	const eslint = createESLint({
		files: ['**/*.js'],
		plugins: { lockfile: plugin },
		rules: {
			'lockfile/version': ['error', { npm: 3 }],
		},
	}, tmpDir);

	const results = await eslint.lintFiles(['index.js']);
	t.equal(results[0].errorCount, 0, 'no errors when no lockfile exists');

	t.end();
});

test('registry rule - yarn lockfile with invalid resolved URL triggers catch', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	const yarnLock = `# This is an autogenerated file

picocolors@^1.0.0:
  version "1.1.1"
  resolved "not-a-valid-url"
  integrity sha512-xceH2snhtb5M9liqDsmEw56le376mTZkEX/jEb/RxNFyegNul7eNslCXP9FDj/Lcu0X8KEyMceP2ntpaHrDEVA==
`;
	writeFileSync(join(tmpDir, 'yarn.lock'), yarnLock);
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	const eslint = createESLint({
		files: ['**/*.js'],
		plugins: { lockfile: plugin },
		rules: {
			'lockfile/registry': ['error', 'https://registry.yarnpkg.com'],
		},
	}, tmpDir);

	const results = await eslint.lintFiles(['index.js']);
	t.equal(results[0].errorCount, 0, 'no errors - invalid URL is skipped');

	t.end();
});

test('registry rule - pnpm with invalid URL in single-line resolution', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	const pnpmLock = `lockfileVersion: 5.4

dependencies:
  picocolors: 1.1.1

packages:

  /picocolors/1.1.1:
    resolution: {integrity: sha512-xceH2snhtb5M9liqDsmEw56le376mTZkEX/jEb/RxNFyegNul7eNslCXP9FDj/Lcu0X8KEyMceP2ntpaHrDEVA==, tarball: not-a-valid-url}
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

	t.end();
});

test('version rule - pnpm lockfile without version field', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	// pnpm lockfile without lockfileVersion field
	writeFileSync(join(tmpDir, 'pnpm-lock.yaml'), 'dependencies:\n  foo: 1.0.0\n');
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	const eslint = createESLint({
		files: ['**/*.js'],
		plugins: { lockfile: plugin },
		rules: {
			'lockfile/version': ['error', { pnpm: '6.0' }],
		},
	}, tmpDir);

	const results = await eslint.lintFiles(['index.js']);
	// Should skip when version is null (file without version field)
	t.equal(results[0].errorCount, 0, 'no errors when pnpm lockfile has no version');

	t.end();
});

test('version rule - bun.lock without version field', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	// bun.lock without lockfileVersion field
	writeFileSync(join(tmpDir, 'bun.lock'), '{"packages": {}}');
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	const eslint = createESLint({
		files: ['**/*.js'],
		plugins: { lockfile: plugin },
		rules: {
			'lockfile/version': ['error', { bun: 1 }],
		},
	}, tmpDir);

	const results = await eslint.lintFiles(['index.js']);
	// The || 0 fallback means version is 0, which doesn't match expected 1
	t.equal(results[0].errorCount, 1, 'error when bun.lock defaults to version 0');

	t.end();
});

test('version rule - malformed npm-shrinkwrap.json', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	// Write malformed JSON to trigger catch block in getLockfileVersion for npm
	writeFileSync(join(tmpDir, 'npm-shrinkwrap.json'), '{invalid json}');
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	const eslint = createESLint({
		files: ['**/*.js'],
		plugins: { lockfile: plugin },
		rules: {
			'lockfile/version': ['error', { npm: 3 }],
		},
	}, tmpDir);

	const results = await eslint.lintFiles(['index.js']);
	// Malformed JSON is caught and reported as an ESLint error
	t.equal(results[0].errorCount, 1, 'reports error for malformed lockfile');
	t.ok(results[0].messages[0].message.includes('malformed'), 'error message mentions malformed');

	t.end();
});

test('version rule - malformed vlt-lock.json', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	// Write malformed JSON to trigger catch block in getLockfileVersion for vlt
	writeFileSync(join(tmpDir, 'vlt-lock.json'), '{"lockfileVersion": 0,}'); // Trailing comma
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	const eslint = createESLint({
		files: ['**/*.js'],
		plugins: { lockfile: plugin },
		rules: {
			'lockfile/version': ['error', { vlt: 0 }],
		},
	}, tmpDir);

	const results = await eslint.lintFiles(['index.js']);
	// Malformed JSON is caught and reported as an ESLint error
	t.equal(results[0].errorCount, 1, 'reports error for malformed lockfile');
	t.ok(results[0].messages[0].message.includes('malformed'), 'error message mentions malformed');

	t.end();
});

test('version rule - malformed yarn.lock does not throw', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	// Write content that doesn't match yarn version detection patterns
	writeFileSync(join(tmpDir, 'yarn.lock'), 'random content that is not a valid yarn lockfile');
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	const eslint = createESLint({
		files: ['**/*.js'],
		plugins: { lockfile: plugin },
		rules: {
			'lockfile/version': ['error', { yarn: 2 }],
		},
	}, tmpDir);

	const results = await eslint.lintFiles(['index.js']);
	// yarn.lock parsing doesn't throw, it returns null and gets skipped
	t.equal(results[0].errorCount, 0, 'no errors - yarn.lock is skipped when version cannot be determined');

	t.end();
});

test('version rule - malformed pnpm-lock.yaml does not throw', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	// Write content that doesn't match pnpm version detection pattern
	writeFileSync(join(tmpDir, 'pnpm-lock.yaml'), 'random: content\nwithout: lockfileVersion\n');
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	const eslint = createESLint({
		files: ['**/*.js'],
		plugins: { lockfile: plugin },
		rules: {
			'lockfile/version': ['error', { pnpm: '9.0' }],
		},
	}, tmpDir);

	const results = await eslint.lintFiles(['index.js']);
	// pnpm-lock.yaml parsing doesn't throw, it returns null and gets skipped
	t.equal(results[0].errorCount, 0, 'no errors - pnpm-lock.yaml is skipped when version cannot be determined');

	t.end();
});

test('version rule - bun.lockb with invalid binary data', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	// Write arbitrary binary content - bun.lockb is always treated as version 0
	writeFileSync(join(tmpDir, 'bun.lockb'), Buffer.from([0x00, 0x01, 0x02, 0x03]));
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	const eslint = createESLint({
		files: ['**/*.js'],
		plugins: { lockfile: plugin },
		rules: {
			'lockfile/version': ['error', { bun: 0 }],
		},
	}, tmpDir);

	const results = await eslint.lintFiles(['index.js']);
	// Invalid binary data triggers malformed error
	t.equal(results[0].errorCount, 1, 'reports error for malformed bun.lockb');
	t.ok(results[0].messages[0].message.includes('malformed'), 'error message mentions malformed');

	t.end();
});
