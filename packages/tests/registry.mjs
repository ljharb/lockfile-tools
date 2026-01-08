import test from 'tape';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createESLint } from './helpers/eslint-compat.mjs';
import plugin from 'eslint-plugin-lockfile';

test('registry rule - default registry allowed', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
			lockfileVersion: 3,
			packages: {
				'node_modules/has-flag': {
					version: '4.0.0',
					resolved: 'https://registry.npmjs.org/has-flag/-/has-flag-4.0.0.tgz',
					integrity: 'sha512-EykJT/Q1KjTWctppgIAgfSO0tKVuZUjhgMr17kqTumMl6Afv3EISleU7qZUzoXDFTAHTDC4NOoG/ZxU3EvlMPQ==',
				},
			},
		}));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/registry': 'error',
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors with default registry');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('registry rule - configured registry allowed', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
			lockfileVersion: 3,
			packages: {
				'node_modules/has-flag': {
					version: '4.0.0',
					resolved: 'https://custom-registry.example.com/has-flag/-/has-flag-4.0.0.tgz',
					integrity: 'sha512-EykJT/Q1KjTWctppgIAgfSO0tKVuZUjhgMr17kqTumMl6Afv3EISleU7qZUzoXDFTAHTDC4NOoG/ZxU3EvlMPQ==',
				},
			},
		}));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/registry': ['error', 'https://custom-registry.example.com'],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors with configured custom registry');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('registry rule - disallowed registry reports error', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
			lockfileVersion: 3,
			packages: {
				'node_modules/has-flag': {
					version: '4.0.0',
					resolved: 'https://untrusted-registry.example.com/has-flag/-/has-flag-4.0.0.tgz',
					integrity: 'sha512-EykJT/Q1KjTWctppgIAgfSO0tKVuZUjhgMr17kqTumMl6Afv3EISleU7qZUzoXDFTAHTDC4NOoG/ZxU3EvlMPQ==',
				},
			},
		}));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/registry': ['error', 'https://registry.npmjs.org'],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 1, 'error reported for disallowed registry');
		t.ok(results[0].messages[0].message.includes('untrusted-registry.example.com'), 'error mentions the untrusted registry');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('registry rule - multiple registries allowed', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
			lockfileVersion: 3,
			packages: {
				'node_modules/has-flag': {
					version: '4.0.0',
					resolved: 'https://registry1.example.com/has-flag/-/has-flag-4.0.0.tgz',
					integrity: 'sha512-EykJT/Q1KjTWctppgIAgfSO0tKVuZUjhgMr17kqTumMl6Afv3EISleU7qZUzoXDFTAHTDC4NOoG/ZxU3EvlMPQ==',
				},
				'node_modules/other-pkg': {
					version: '1.0.0',
					resolved: 'https://registry2.example.com/other-pkg/-/other-pkg-1.0.0.tgz',
					integrity: 'sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
				},
			},
		}));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/registry': ['error', ['https://registry1.example.com', 'https://registry2.example.com']],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors when both registries are allowed');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('registry rule - yarn lockfile', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'yarn.lock'), `# yarn lockfile v1

has-flag@^4.0.0:
  version "4.0.0"
  resolved "https://registry.yarnpkg.com/has-flag/-/has-flag-4.0.0.tgz#944771fd9c81c81265c4d6941860da06bb59479b"
  integrity sha512-EykJT/Q1KjTWctppgIAgfSO0tKVuZUjhgMr17kqTumMl6Afv3EISleU7qZUzoXDFTAHTDC4NOoG/ZxU3EvlMPQ==
`);
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/registry': ['error', 'https://registry.yarnpkg.com'],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors with yarn lockfile and allowed registry');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('registry rule - npm v1 lockfile with nested dependencies', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		const npmLock = {
			lockfileVersion: 1,
			dependencies: {
				foo: {
					version: '1.0.0',
					resolved: 'https://registry.npmjs.org/foo/-/foo-1.0.0.tgz',
					dependencies: {
						bar: {
							version: '2.0.0',
							resolved: 'https://registry.npmjs.org/bar/-/bar-2.0.0.tgz',
						},
					},
				},
			},
		};
		writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify(npmLock));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/registry': ['error', 'https://registry.npmjs.org'],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors with nested dependencies in npm v1 lockfile');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}
	t.end();
});

test('registry rule - object config with true for default registry', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
			lockfileVersion: 3,
			packages: {
				'node_modules/lodash': {
					version: '4.17.21',
					resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz',
					integrity: 'sha512-test',
				},
			},
		}));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/registry': ['error', {
					'https://registry.npmjs.org': true,
				}],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors with object config using true');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('registry rule - object config with scoped package pattern', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
			lockfileVersion: 3,
			packages: {
				'node_modules/@company/internal': {
					version: '1.0.0',
					resolved: 'https://npm.internal.company.com/@company/internal/-/internal-1.0.0.tgz',
					integrity: 'sha512-test',
				},
				'node_modules/lodash': {
					version: '4.17.21',
					resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz',
					integrity: 'sha512-test2',
				},
			},
		}));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/registry': ['error', {
					'https://npm.internal.company.com': '@company/*',
					'https://registry.npmjs.org': true,
				}],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors with scoped package from correct registry');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('registry rule - object config with wrong registry for scoped package', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
			lockfileVersion: 3,
			packages: {
				'node_modules/@company/internal': {
					version: '1.0.0',
					resolved: 'https://registry.npmjs.org/@company/internal/-/internal-1.0.0.tgz',
					integrity: 'sha512-test',
				},
			},
		}));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/registry': ['error', {
					'https://npm.internal.company.com': '@company/*',
					'https://registry.npmjs.org': true,
				}],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 1, 'error reported for scoped package from wrong registry');
		t.ok(results[0].messages[0].message.includes('@company/internal'), 'error mentions package name');
		t.ok(results[0].messages[0].message.includes('npm.internal.company.com'), 'error mentions expected registry');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('registry rule - object config with multiple patterns', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
			lockfileVersion: 3,
			packages: {
				'node_modules/@company/internal': {
					version: '1.0.0',
					resolved: 'https://npm.company.com/@company/internal/-/internal-1.0.0.tgz',
					integrity: 'sha512-test1',
				},
				'node_modules/@internal/private': {
					version: '2.0.0',
					resolved: 'https://npm.company.com/@internal/private/-/private-2.0.0.tgz',
					integrity: 'sha512-test2',
				},
			},
		}));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/registry': ['error', {
					'https://npm.company.com': ['@company/*', '@internal/*'],
				}],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors with multiple patterns in array');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('registry rule - object config with prefix pattern', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
			lockfileVersion: 3,
			packages: {
				'node_modules/partner-api': {
					version: '1.0.0',
					resolved: 'https://npm.partner.com/partner-api/-/partner-api-1.0.0.tgz',
					integrity: 'sha512-test',
				},
				'node_modules/partner-utils': {
					version: '2.0.0',
					resolved: 'https://npm.partner.com/partner-utils/-/partner-utils-2.0.0.tgz',
					integrity: 'sha512-test2',
				},
			},
		}));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/registry': ['error', {
					'https://npm.partner.com': 'partner-*',
				}],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors with prefix pattern match');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('registry rule - object config without true errors on unmatched package', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
			lockfileVersion: 3,
			packages: {
				'node_modules/@company/internal': {
					version: '1.0.0',
					resolved: 'https://npm.company.com/@company/internal/-/internal-1.0.0.tgz',
					integrity: 'sha512-test1',
				},
				'node_modules/lodash': {
					version: '4.17.21',
					resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz',
					integrity: 'sha512-test2',
				},
			},
		}));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/registry': ['error', {
					'https://npm.company.com': '@company/*',
				}],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 1, 'error reported for package not matching any pattern');
		t.ok(results[0].messages[0].message.includes('lodash'), 'error mentions unmatched package');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('registry rule - object config with complex multi-registry setup', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
			lockfileVersion: 3,
			packages: {
				'node_modules/@company/internal': {
					version: '1.0.0',
					resolved: 'https://npm.company.com/@company/internal/-/internal-1.0.0.tgz',
					integrity: 'sha512-test1',
				},
				'node_modules/@partner/api': {
					version: '2.0.0',
					resolved: 'https://npm.partner.com/@partner/api/-/api-2.0.0.tgz',
					integrity: 'sha512-test2',
				},
				'node_modules/partner-client': {
					version: '1.5.0',
					resolved: 'https://npm.partner.com/partner-client/-/partner-client-1.5.0.tgz',
					integrity: 'sha512-test3',
				},
				'node_modules/lodash': {
					version: '4.17.21',
					resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz',
					integrity: 'sha512-test4',
				},
			},
		}));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/registry': ['error', {
					'https://npm.company.com': '@company/*',
					'https://npm.partner.com': ['@partner/*', 'partner-*'],
					'https://registry.npmjs.org': true,
				}],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors with complex multi-registry setup');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('registry rule - object config with yarn lockfile', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'yarn.lock'), `# yarn lockfile v1

"@company/internal@^1.0.0":
  version "1.0.0"
  resolved "https://npm.company.com/@company/internal/-/internal-1.0.0.tgz#abc123"
  integrity sha512-test1

lodash@^4.17.21:
  version "4.17.21"
  resolved "https://registry.yarnpkg.com/lodash/-/lodash-4.17.21.tgz#def456"
  integrity sha512-test2
`);
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/registry': ['error', {
					'https://npm.company.com': '@company/*',
					'https://registry.yarnpkg.com': true,
				}],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors with yarn lockfile and object config');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('registry rule - object config with pnpm lockfile', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'pnpm-lock.yaml'), `lockfileVersion: '6.0'

packages:

  '@company/internal@1.0.0':
    resolution: {integrity: sha512-test1, tarball: https://npm.company.com/@company/internal/-/internal-1.0.0.tgz}

  lodash@4.17.21:
    resolution: {integrity: sha512-test2, tarball: https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz}
`);
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/registry': ['error', {
					'https://npm.company.com': '@company/*',
					'https://registry.npmjs.org': true,
				}],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors with pnpm lockfile and object config');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('registry rule - virtual lockfile with default registry', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
			name: 'test',
			dependencies: {
				'object-inspect': '^1.13.0',
			},
		}));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/registry': ['error', 'https://registry.npmjs.org'],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors when using virtual lockfile with default registry');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('registry rule - git+ssh URLs are not checked (non-registry specifiers)', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
			lockfileVersion: 3,
			packages: {
				'node_modules/some-git-dep': {
					version: '1.0.0',
					resolved: 'git+ssh://git@github.com/user/repo.git#abc123',
				},
				'node_modules/has-flag': {
					version: '4.0.0',
					resolved: 'https://registry.npmjs.org/has-flag/-/has-flag-4.0.0.tgz',
					integrity: 'sha512-EykJT/Q1KjTWctppgIAgfSO0tKVuZUjhgMr17kqTumMl6Afv3EISleU7qZUzoXDFTAHTDC4NOoG/ZxU3EvlMPQ==',
				},
			},
		}));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		// Only allow the default npm registry - git+ssh should NOT trigger an error
		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/registry': ['error', 'https://registry.npmjs.org'],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		// The git+ssh URL should be ignored by the registry rule
		// (it may be flagged by non-registry-specifiers rule separately, but not by registry)
		t.equal(results[0].errorCount, 0, 'git+ssh URLs are not checked by registry rule');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('registry rule - git+https URLs are not checked (non-registry specifiers)', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
			lockfileVersion: 3,
			packages: {
				'node_modules/some-git-dep': {
					version: '1.0.0',
					resolved: 'git+https://github.com/user/repo.git#abc123',
				},
			},
		}));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		// Only allow a custom registry - git+https should NOT trigger an error
		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/registry': ['error', 'https://custom-registry.example.com'],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'git+https URLs are not checked by registry rule');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('registry rule - file: URLs are not checked (non-registry specifiers)', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
			lockfileVersion: 3,
			packages: {
				'node_modules/local-dep': {
					version: '1.0.0',
					resolved: 'file:../local-dep',
				},
			},
		}));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/registry': ['error', 'https://registry.npmjs.org'],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'file: URLs are not checked by registry rule');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});
