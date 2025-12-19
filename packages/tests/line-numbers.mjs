import test from 'tape';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createESLint } from './helpers/eslint-compat.mjs';
import plugin from 'eslint-plugin-lockfile';

test('integrity rule - reports correct line number for missing integrity', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-line-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		// Create lockfile with specific formatting so we know exactly which line "node_modules/has-flag" appears on
		const lockfileContent = `{
  "lockfileVersion": 3,
  "packages": {
    "node_modules/has-flag": {
      "version": "4.0.0",
      "resolved": "https://registry.npmjs.org/has-flag/-/has-flag-4.0.0.tgz"
    }
  }
}`;
		// Line 4 is "node_modules/has-flag"
		writeFileSync(join(tmpDir, 'package-lock.json'), lockfileContent);
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/integrity': 'error',
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 1, 'one error reported');
		t.equal(results[0].messages[0].line, 4, 'error reported on line 4 where package appears');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('registry rule (string config) - reports correct line number for disallowed registry', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-line-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		const lockfileContent = `{
  "lockfileVersion": 3,
  "packages": {
    "node_modules/test-pkg": {
      "version": "1.0.0",
      "resolved": "https://bad-registry.example.com/test-pkg/-/test-pkg-1.0.0.tgz",
      "integrity": "sha512-abc123"
    }
  }
}`;
		// Line 4 is "node_modules/test-pkg"
		writeFileSync(join(tmpDir, 'package-lock.json'), lockfileContent);
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/registry': ['error', 'https://registry.npmjs.org/'],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 1, 'one error reported');
		t.equal(results[0].messages[0].line, 4, 'error reported on line 4 where package appears');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('registry rule (object config) - reports correct line number for wrong registry', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-line-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		const lockfileContent = `{
  "lockfileVersion": 3,
  "packages": {
    "node_modules/@company/private-pkg": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/@company/private-pkg/-/private-pkg-1.0.0.tgz",
      "integrity": "sha512-abc123"
    }
  }
}`;
		// Line 4 is "node_modules/@company/private-pkg"
		writeFileSync(join(tmpDir, 'package-lock.json'), lockfileContent);
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/registry': ['error', {
					'https://registry.npmjs.org/': true,
					'https://private.registry.com/': '@company/*',
				}],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 1, 'one error reported');
		t.equal(results[0].messages[0].line, 4, 'error reported on line 4 where package appears');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('non-registry-specifiers rule - reports correct line number for git URL', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-line-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		const lockfileContent = `{
  "lockfileVersion": 3,
  "packages": {
    "node_modules/git-pkg": {
      "version": "1.0.0",
      "resolved": "git+https://github.com/user/repo.git#abc123"
    }
  }
}`;
		// Line 4 is "node_modules/git-pkg"
		writeFileSync(join(tmpDir, 'package-lock.json'), lockfileContent);
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/non-registry-specifiers': 'error',
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 1, 'one error reported');
		t.equal(results[0].messages[0].line, 4, 'error reported on line 4 where package appears');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('line numbers - multiple errors on different lines', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-line-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		const lockfileContent = `{
  "lockfileVersion": 3,
  "packages": {
    "node_modules/pkg-a": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/pkg-a/-/pkg-a-1.0.0.tgz"
    },
    "node_modules/pkg-b": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/pkg-b/-/pkg-b-2.0.0.tgz"
    }
  }
}`;
		// Line 4 is "node_modules/pkg-a", Line 8 is "node_modules/pkg-b"
		writeFileSync(join(tmpDir, 'package-lock.json'), lockfileContent);
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/integrity': 'error',
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 2, 'two errors reported');
		const lines = results[0].messages.map((m) => m.line).sort((a, b) => a - b);
		t.deepEqual(lines, [4, 8], 'errors reported on correct lines for each package');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('line numbers - yarn lockfile reports correct lines', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-line-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		// Yarn lockfile format - "pkg-name@version:" appears at line start
		const yarnLockContent = `# yarn lockfile v1

pkg-a@^1.0.0:
  version "1.0.0"
  resolved "https://registry.npmjs.org/pkg-a/-/pkg-a-1.0.0.tgz"

pkg-b@^2.0.0:
  version "2.0.0"
  resolved "https://registry.npmjs.org/pkg-b/-/pkg-b-2.0.0.tgz"
`;
		// "pkg-a@^1.0.0:" is on line 3, "pkg-b@^2.0.0:" is on line 7
		writeFileSync(join(tmpDir, 'yarn.lock'), yarnLockContent);
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/integrity': 'error',
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 2, 'two errors reported');
		const lines = results[0].messages.map((m) => m.line).sort((a, b) => a - b);
		t.deepEqual(lines, [3, 7], 'errors reported on correct lines for yarn lockfile');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});
