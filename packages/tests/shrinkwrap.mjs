import test from 'tape';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import esmock from 'esmock';
import { createESLint } from './helpers/eslint-compat.mjs';
import plugin from 'eslint-plugin-lockfile';

// -- Helper to create a mock pacote --
/** @type {(manifests: Record<string, { _hasShrinkwrap?: boolean }>) => { manifest: (spec: string, opts?: object) => Promise<object> }} */
function createMockPacote(manifests) {
	return {
		async manifest(spec) {
			if (spec in manifests) {
				return manifests[spec];
			}
			throw new Error(`404 Not Found - ${spec}`);
		},
	};
}

// -- Helper to create a mock rule via esmock --
/** @type {(manifests: Record<string, { _hasShrinkwrap?: boolean }>) => Promise<import('eslint').Rule.RuleModule>} */
async function createMockedRule(manifests) {
	return esmock('eslint-plugin-lockfile/rules/shrinkwrap.mjs', {}, {
		pacote: createMockPacote(manifests),
	});
}

// -- Helper to invoke the rule directly on a context --
/**
 * @param {import('eslint').Rule.RuleModule} rule
 * @param {string} testFile
 * @param {string[]} [ignoreSpecs]
 */
async function runRule(rule, testFile, ignoreSpecs) {
	/** @type {{ messageId?: string; data?: Record<string, unknown>; loc?: unknown }[]} */
	const reports = [];
	const context = {
		filename: testFile,
		options: ignoreSpecs ? [ignoreSpecs] : [],
		/** @param {{ messageId?: string; data?: Record<string, unknown>; loc?: unknown }} info */
		report(info) {
			reports.push(info);
		},
	};
	// @ts-expect-error mock context
	const ruleInstance = rule.create(context);
	// @ts-expect-error mock node
	// eslint-disable-next-line new-cap
	await ruleInstance.Program({ type: 'Program' });
	return reports;
}

// =============================================================
// Tests using ESLint integration (full plugin, real pacote)
// =============================================================

test('shrinkwrap rule - no errors when no packages have shrinkwrap', async (t) => {
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
				'lockfile/shrinkwrap': 'error',
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors when packages do not have shrinkwrap');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('shrinkwrap rule - invalid ignore entry (npa throws)', async (t) => {
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
				'lockfile/shrinkwrap': ['error', ['@']],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 1, 'error reported for invalid ignore entry');
		t.ok(results[0].messages[0].message.includes('Invalid ignore entry'), 'error mentions invalid ignore entry');
		t.ok(results[0].messages[0].message.includes('@'), 'error mentions the specifier');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('shrinkwrap rule - invalid ignore entry (no package name)', async (t) => {
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
				'lockfile/shrinkwrap': ['error', ['http://example.com/foo.tgz']],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 1, 'error reported for ignore entry without package name');
		t.ok(results[0].messages[0].message.includes('must include a package name'), 'error mentions package name requirement');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('shrinkwrap rule - invalid ignore entry (non-registry specifier)', async (t) => {
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
				'lockfile/shrinkwrap': ['error', ['foo@git+https://github.com/user/repo.git']],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 1, 'error reported for non-registry ignore entry');
		t.ok(results[0].messages[0].message.includes('must be a registry specifier'), 'error mentions registry specifier requirement');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

// =============================================================
// Tests using mocked pacote (esmock) for deterministic behavior
// =============================================================

test('shrinkwrap rule - detects package with shrinkwrap in npm lockfile v3', async (t) => {
	const rule = await createMockedRule({
		'shrinkwrapped-pkg@1.0.0': { _hasShrinkwrap: true },
		'normal-pkg@2.0.0': { _hasShrinkwrap: false },
	});
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 3,
		packages: {
			'': { name: 'test' },
			'node_modules/shrinkwrapped-pkg': { version: '1.0.0' },
			'node_modules/normal-pkg': { version: '2.0.0' },
		},
	}, null, 2));

	const reports = await runRule(rule, join(tmpDir, 'index.js'));

	t.equal(reports.length, 1, 'one error reported');
	t.equal(reports[0].messageId, 'hasShrinkwrap', 'correct messageId');
	t.equal(reports[0].data?.name, 'shrinkwrapped-pkg', 'reports the correct package name');
	t.equal(reports[0].data?.version, '1.0.0', 'reports the correct version');
	t.ok(reports[0].loc, 'report includes location');
	t.end();
});

test('shrinkwrap rule - ignores package by bare name', async (t) => {
	const rule = await createMockedRule({
		'shrinkwrapped-pkg@1.0.0': { _hasShrinkwrap: true },
	});
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 3,
		packages: {
			'': { name: 'test' },
			'node_modules/shrinkwrapped-pkg': { version: '1.0.0' },
		},
	}));

	const reports = await runRule(rule, join(tmpDir, 'index.js'), ['shrinkwrapped-pkg']);

	t.equal(reports.length, 0, 'no errors when package is ignored by bare name');
	t.end();
});

test('shrinkwrap rule - ignores package by name@* wildcard', async (t) => {
	const rule = await createMockedRule({
		'shrinkwrapped-pkg@1.0.0': { _hasShrinkwrap: true },
	});
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 3,
		packages: {
			'': { name: 'test' },
			'node_modules/shrinkwrapped-pkg': { version: '1.0.0' },
		},
	}));

	const reports = await runRule(rule, join(tmpDir, 'index.js'), ['shrinkwrapped-pkg@*']);

	t.equal(reports.length, 0, 'no errors when package is ignored by wildcard');
	t.end();
});

test('shrinkwrap rule - ignores package by semver range', async (t) => {
	const rule = await createMockedRule({
		'shrinkwrapped-pkg@1.0.0': { _hasShrinkwrap: true },
	});
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 3,
		packages: {
			'': { name: 'test' },
			'node_modules/shrinkwrapped-pkg': { version: '1.0.0' },
		},
	}));

	const reports = await runRule(rule, join(tmpDir, 'index.js'), ['shrinkwrapped-pkg@^1.0.0']);

	t.equal(reports.length, 0, 'no errors when package matches semver range');
	t.end();
});

test('shrinkwrap rule - does not ignore package outside semver range', async (t) => {
	const rule = await createMockedRule({
		'shrinkwrapped-pkg@2.0.0': { _hasShrinkwrap: true },
	});
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 3,
		packages: {
			'': { name: 'test' },
			'node_modules/shrinkwrapped-pkg': { version: '2.0.0' },
		},
	}));

	const reports = await runRule(rule, join(tmpDir, 'index.js'), ['shrinkwrapped-pkg@^1.0.0']);

	t.equal(reports.length, 1, 'error reported when version outside ignore range');
	t.end();
});

test('shrinkwrap rule - second invalid ignore entry after valid one', async (t) => {
	const rule = await createMockedRule({
		'shrinkwrapped-pkg@1.0.0': { _hasShrinkwrap: true },
	});
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 3,
		packages: {
			'': { name: 'test' },
			'node_modules/shrinkwrapped-pkg': { version: '1.0.0' },
		},
	}));

	const reports = await runRule(rule, join(tmpDir, 'index.js'), ['valid-pkg', '@']);

	t.equal(reports.length, 1, 'one error reported for second invalid entry');
	t.equal(reports[0].messageId, 'invalidIgnoreEntry', 'reports invalidIgnoreEntry');
	t.end();
});

test('shrinkwrap rule - npm lockfile v1 with dependencies', async (t) => {
	const rule = await createMockedRule({
		'top-pkg@1.0.0': { _hasShrinkwrap: true },
		'nested-pkg@2.0.0': { _hasShrinkwrap: false },
	});
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 1,
		dependencies: {
			'top-pkg': {
				version: '1.0.0',
				dependencies: {
					'nested-pkg': {
						version: '2.0.0',
					},
				},
			},
		},
	}));

	const reports = await runRule(rule, join(tmpDir, 'index.js'));

	t.equal(reports.length, 1, 'one error reported for v1 lockfile');
	t.equal(reports[0].data?.name, 'top-pkg', 'reports top-level dep');
	t.end();
});

test('shrinkwrap rule - npm lockfile v1 dep without version', async (t) => {
	const rule = await createMockedRule({
		'some-pkg@unknown': { _hasShrinkwrap: false },
	});
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 1,
		dependencies: {
			'some-pkg': {},
		},
	}));

	const reports = await runRule(rule, join(tmpDir, 'index.js'));

	t.equal(reports.length, 0, 'no errors for dep without version');
	t.end();
});

test('shrinkwrap rule - npm lockfile v3 package without version', async (t) => {
	const rule = await createMockedRule({
		'no-version-pkg@unknown': { _hasShrinkwrap: false },
	});
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 3,
		packages: {
			'': { name: 'test' },
			'node_modules/no-version-pkg': {},
		},
	}));

	const reports = await runRule(rule, join(tmpDir, 'index.js'));

	t.equal(reports.length, 0, 'no errors for package without version');
	t.end();
});

test('shrinkwrap rule - npm lockfile skips workspace links and non-node_modules entries', async (t) => {
	const rule = await createMockedRule({
		'real-pkg@1.0.0': { _hasShrinkwrap: false },
	});
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 3,
		packages: {
			'': { name: 'test' },
			'node_modules/real-pkg': { version: '1.0.0' },
			'node_modules/workspace-link': { version: '0.0.0', link: true },
			'packages/workspace-pkg': { version: '0.0.0' },
		},
	}));

	const reports = await runRule(rule, join(tmpDir, 'index.js'));

	t.equal(reports.length, 0, 'no errors - workspace links and non-node_modules entries skipped');
	t.end();
});

test('shrinkwrap rule - npm lockfile with neither packages nor dependencies', async (t) => {
	const rule = await createMockedRule({});
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 3,
	}));

	const reports = await runRule(rule, join(tmpDir, 'index.js'));

	t.equal(reports.length, 0, 'no errors for lockfile with no packages or dependencies');
	t.end();
});

test('shrinkwrap rule - pacote error (package not found) returns null', async (t) => {
	const rule = await createMockedRule({}); // Empty manifests = all lookups throw
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 3,
		packages: {
			'': { name: 'test' },
			'node_modules/nonexistent-pkg': { version: '1.0.0' },
		},
	}));

	const reports = await runRule(rule, join(tmpDir, 'index.js'));

	t.equal(reports.length, 0, 'no errors when pacote throws (returns null)');
	t.end();
});

test('shrinkwrap rule - yarn.lock format', async (t) => {
	const rule = await createMockedRule({
		'yarn-pkg@1.2.3': { _hasShrinkwrap: true },
	});
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'yarn.lock'), [
		'# yarn lockfile v1',
		'',
		'yarn-pkg@^1.0.0:',
		'  version "1.2.3"',
		'  resolved "https://registry.yarnpkg.com/yarn-pkg/-/yarn-pkg-1.2.3.tgz"',
		'  integrity sha512-abc123==',
		'',
	].join('\n'));

	const reports = await runRule(rule, join(tmpDir, 'index.js'));

	t.equal(reports.length, 1, 'detects shrinkwrap in yarn.lock');
	t.equal(reports[0].data?.name, 'yarn-pkg', 'correct package name from yarn.lock');
	t.end();
});

test('shrinkwrap rule - yarn.lock entry without version field', async (t) => {
	const rule = await createMockedRule({
		'git-pkg@unknown': { _hasShrinkwrap: false },
	});
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'yarn.lock'), [
		'# yarn lockfile v1',
		'',
		'git-pkg@github:user/repo:',
		'  resolved "https://github.com/user/repo#abc123"',
		'',
	].join('\n'));

	const reports = await runRule(rule, join(tmpDir, 'index.js'));

	t.equal(reports.length, 0, 'no errors for git dep without version');
	t.end();
});

test('shrinkwrap rule - pnpm-lock.yaml format', async (t) => {
	const rule = await createMockedRule({
		'pnpm-pkg@3.0.0': { _hasShrinkwrap: true },
	});
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'pnpm-lock.yaml'), [
		'lockfileVersion: "9.0"',
		'',
		'packages:',
		'  pnpm-pkg@3.0.0:',
		'    resolution: {integrity: sha512-abc==}',
		'',
	].join('\n'));

	const reports = await runRule(rule, join(tmpDir, 'index.js'));

	t.equal(reports.length, 1, 'detects shrinkwrap in pnpm-lock.yaml');
	t.equal(reports[0].data?.name, 'pnpm-pkg', 'correct package name from pnpm lockfile');
	t.end();
});

test('shrinkwrap rule - pnpm-lock.yaml with multiple packages', async (t) => {
	const rule = await createMockedRule({
		'pkg-a@1.0.0': { _hasShrinkwrap: true },
		'pkg-b@2.0.0': { _hasShrinkwrap: true },
	});
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'pnpm-lock.yaml'), [
		'lockfileVersion: "9.0"',
		'',
		'packages:',
		'  pkg-a@1.0.0:',
		'    resolution: {integrity: sha512-aaa==}',
		'  pkg-b@2.0.0:',
		'    resolution: {integrity: sha512-bbb==}',
		'',
	].join('\n'));

	const reports = await runRule(rule, join(tmpDir, 'index.js'));

	t.equal(reports.length, 2, 'detects shrinkwrap in both pnpm packages');
	t.end();
});

test('shrinkwrap rule - pnpm-lock.yaml with no packages section', async (t) => {
	const rule = await createMockedRule({});
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'pnpm-lock.yaml'), [
		'lockfileVersion: "9.0"',
		'',
		'importers:',
		'  .:',
		'    dependencies: {}',
		'',
	].join('\n'));

	const reports = await runRule(rule, join(tmpDir, 'index.js'));

	t.equal(reports.length, 0, 'no errors for pnpm lockfile without packages section');
	t.end();
});

test('shrinkwrap rule - bun.lock format', async (t) => {
	const rule = await createMockedRule({
		'bun-pkg@4.0.0': { _hasShrinkwrap: true },
	});
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'bun.lock'), JSON.stringify({
		lockfileVersion: 1,
		packages: {
			'bun-pkg': ['bun-pkg@4.0.0', '4.0.0'],
		},
	}));

	const reports = await runRule(rule, join(tmpDir, 'index.js'));

	t.equal(reports.length, 1, 'detects shrinkwrap in bun.lock');
	t.equal(reports[0].data?.name, 'bun-pkg', 'correct package name from bun lockfile');
	t.end();
});

test('shrinkwrap rule - bun.lock with no packages', async (t) => {
	const rule = await createMockedRule({});
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'bun.lock'), JSON.stringify({
		lockfileVersion: 1,
	}));

	const reports = await runRule(rule, join(tmpDir, 'index.js'));

	t.equal(reports.length, 0, 'no errors for bun lockfile without packages');
	t.end();
});

test('shrinkwrap rule - bun.lock with non-array package entry', async (t) => {
	const rule = await createMockedRule({});
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'bun.lock'), JSON.stringify({
		lockfileVersion: 1,
		packages: {
			'bad-entry': 'not-an-array',
			'short-entry': ['only-one'],
		},
	}));

	const reports = await runRule(rule, join(tmpDir, 'index.js'));

	t.equal(reports.length, 0, 'no errors for non-array or short-array entries');
	t.end();
});

test('shrinkwrap rule - bun.lock with scoped package (no @ in nameAtVersion)', async (t) => {
	const rule = await createMockedRule({
		'noscope@1.0.0': { _hasShrinkwrap: false },
	});
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'bun.lock'), JSON.stringify({
		lockfileVersion: 1,
		packages: {
			noscope: ['noscope', '1.0.0'],
		},
	}));

	const reports = await runRule(rule, join(tmpDir, 'index.js'));

	t.equal(reports.length, 0, 'handles nameAtVersion without @ sign');
	t.end();
});

test('shrinkwrap rule - vlt-lock.json format', async (t) => {
	const rule = await createMockedRule({
		'vlt-pkg@5.0.0': { _hasShrinkwrap: true },
	});
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'vlt-lock.json'), JSON.stringify({
		lockfileVersion: 0,
		nodes: {
			'vlt-pkg@5.0.0': [null, 'vlt-pkg'],
		},
	}));

	const reports = await runRule(rule, join(tmpDir, 'index.js'));

	t.equal(reports.length, 1, 'detects shrinkwrap in vlt-lock.json');
	t.equal(reports[0].data?.name, 'vlt-pkg', 'correct package name from vlt lockfile');
	t.end();
});

test('shrinkwrap rule - vlt-lock.json with no nodes', async (t) => {
	const rule = await createMockedRule({});
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'vlt-lock.json'), JSON.stringify({
		lockfileVersion: 0,
	}));

	const reports = await runRule(rule, join(tmpDir, 'index.js'));

	t.equal(reports.length, 0, 'no errors for vlt lockfile without nodes');
	t.end();
});

test('shrinkwrap rule - vlt-lock.json with non-array node entry', async (t) => {
	const rule = await createMockedRule({});
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'vlt-lock.json'), JSON.stringify({
		lockfileVersion: 0,
		nodes: {
			'bad-entry': 'not-an-array',
			'short-entry': ['only-one'],
		},
	}));

	const reports = await runRule(rule, join(tmpDir, 'index.js'));

	t.equal(reports.length, 0, 'no errors for non-array or short-array node entries');
	t.end();
});

test('shrinkwrap rule - vlt-lock.json with key that has no @ for version', async (t) => {
	const rule = await createMockedRule({
		'nover@unknown': { _hasShrinkwrap: false },
	});
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'vlt-lock.json'), JSON.stringify({
		lockfileVersion: 0,
		nodes: {
			nover: [null, 'nover'],
		},
	}));

	const reports = await runRule(rule, join(tmpDir, 'index.js'));

	t.equal(reports.length, 0, 'handles vlt key without @ (empty version falls back to unknown)');
	t.end();
});

test('shrinkwrap rule - malformed lockfile reports error', async (t) => {
	const rule = await createMockedRule({});
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'package-lock.json'), 'not valid json{{{');

	const reports = await runRule(rule, join(tmpDir, 'index.js'));

	t.ok(reports.some((r) => r.messageId === 'malformedLockfile'), 'reports malformedLockfile error');
	t.end();
});

test('shrinkwrap rule - malformed lockfile error is not an Error instance', async (t) => {
	// Mock createLockfileExtractor to throw a non-Error value
	const rule = await esmock('eslint-plugin-lockfile/rules/shrinkwrap.mjs', {}, {
		pacote: createMockPacote({}),
		'lockfile-tools/parsers': {
			parseYarnLockfile: () => [],
			createLockfileExtractor() {
				return () => {
					throw 'string error'; // eslint-disable-line no-throw-literal
				};
			},
		},
	});
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3 }));

	const reports = await runRule(rule, join(tmpDir, 'index.js'));

	t.ok(reports.some((r) => r.messageId === 'malformedLockfile'), 'reports malformedLockfile');
	t.ok(
		reports.some((r) => r.data?.error === 'string error'),
		'uses String(e) for non-Error thrown values',
	);
	t.end();
});

test('shrinkwrap rule - pnpm-lock.yaml package key without version (no @ in key)', async (t) => {
	const rule = await createMockedRule({
		'no-version@unknown': { _hasShrinkwrap: false },
	});
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'pnpm-lock.yaml'), [
		'lockfileVersion: "9.0"',
		'',
		'packages:',
		'  no-version:',
		'    resolution: {integrity: sha512-abc==}',
		'',
	].join('\n'));

	const reports = await runRule(rule, join(tmpDir, 'index.js'));

	t.equal(reports.length, 0, 'handles pnpm key without version');
	t.end();
});

test('shrinkwrap rule - two invalid ignore entries (acc already null after first)', async (t) => {
	const rule = await createMockedRule({
		'shrinkwrapped-pkg@1.0.0': { _hasShrinkwrap: true },
	});
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 3,
		packages: {
			'': { name: 'test' },
			'node_modules/shrinkwrapped-pkg': { version: '1.0.0' },
		},
	}));

	// First entry is invalid (npa throws), second would also be invalid but acc is already null
	const reports = await runRule(rule, join(tmpDir, 'index.js'), ['@', 'another-bad@']);

	t.equal(reports.length, 1, 'only one error reported (first invalid entry; second skipped via null acc)');
	t.equal(reports[0].messageId, 'invalidIgnoreEntry', 'reports invalidIgnoreEntry');
	t.end();
});

test('shrinkwrap rule - context.getFilename() fallback when context.filename is undefined', async (t) => {
	const rule = await createMockedRule({
		'some-pkg@1.0.0': { _hasShrinkwrap: false },
	});
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 3,
		packages: {
			'': { name: 'test' },
			'node_modules/some-pkg': { version: '1.0.0' },
		},
	}));

	const testFile = join(tmpDir, 'index.js');
	/** @type {{ messageId?: string; data?: Record<string, unknown> }[]} */
	const reports = [];
	const context = {
		filename: undefined,
		getFilename() { return testFile; },
		options: [],
		/** @param {{ messageId?: string; data?: Record<string, unknown> }} info */
		report(info) { reports.push(info); },
	};
	// @ts-expect-error mock context
	const ruleInstance = rule.create(context);
	// @ts-expect-error mock node
	// eslint-disable-next-line new-cap
	await ruleInstance.Program({ type: 'Program' });

	t.equal(reports.length, 0, 'no errors when using getFilename() fallback');
	t.end();
});

test('shrinkwrap rule - virtual lockfile (no lockfile exists)', async (t) => {
	const rule = await esmock('eslint-plugin-lockfile/rules/shrinkwrap.mjs', {}, {
		pacote: createMockPacote({
			'virtual-pkg@1.0.0': { _hasShrinkwrap: true },
		}),
		'lockfile-tools/virtual': {
			hasLockfile() { return false; },
			buildVirtualLockfile() {
				return Promise.resolve([
					{ name: 'virtual-pkg', version: '1.0.0' },
				]);
			},
		},
	});
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));

	const reports = await runRule(rule, join(tmpDir, 'index.js'));

	t.equal(reports.length, 1, 'detects shrinkwrap in virtual lockfile');
	t.equal(reports[0].data?.name, 'virtual-pkg', 'reports the correct package name');
	t.equal(reports[0].data?.filename, 'virtual', 'filename is "virtual"');
	t.end();
});

test('shrinkwrap rule - virtual lockfile with ignored package', async (t) => {
	const rule = await esmock('eslint-plugin-lockfile/rules/shrinkwrap.mjs', {}, {
		pacote: createMockPacote({
			'virtual-pkg@1.0.0': { _hasShrinkwrap: true },
		}),
		'lockfile-tools/virtual': {
			hasLockfile() { return false; },
			buildVirtualLockfile() {
				return Promise.resolve([
					{ name: 'virtual-pkg', version: '1.0.0' },
				]);
			},
		},
	});
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));

	const reports = await runRule(rule, join(tmpDir, 'index.js'), ['virtual-pkg']);

	t.equal(reports.length, 0, 'no errors when virtual package is ignored');
	t.end();
});

test('shrinkwrap rule - virtual lockfile with pacote error', async (t) => {
	const rule = await esmock('eslint-plugin-lockfile/rules/shrinkwrap.mjs', {}, {
		pacote: createMockPacote({}), // all lookups throw
		'lockfile-tools/virtual': {
			hasLockfile() { return false; },
			buildVirtualLockfile() {
				return Promise.resolve([
					{ name: 'missing-pkg', version: '1.0.0' },
				]);
			},
		},
	});
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));

	const reports = await runRule(rule, join(tmpDir, 'index.js'));

	t.equal(reports.length, 0, 'no errors when pacote fails in virtual lockfile path');
	t.end();
});

test('shrinkwrap rule - yarn.lock entry with empty name (regex no match)', async (t) => {
	const rule = await createMockedRule({
		'@unknown': { _hasShrinkwrap: false },
	});
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'yarn.lock'), [
		'# yarn lockfile v1',
		'',
		'"@":', // name that might not match the regex
		'  version "1.0.0"',
		'',
	].join('\n'));

	const reports = await runRule(rule, join(tmpDir, 'index.js'));

	t.equal(reports.length, 0, 'handles yarn entry where name regex may not match');
	t.end();
});

test('shrinkwrap rule - bun.lockb binary file handling', async (t) => {
	const rule = await esmock('eslint-plugin-lockfile/rules/shrinkwrap.mjs', {}, {
		pacote: createMockPacote({
			'lockb-pkg@1.0.0': { _hasShrinkwrap: true },
		}),
		'lockfile-tools/io': {
			loadBunLockbContent() {
				return [
					'# yarn lockfile v1',
					'',
					'lockb-pkg@^1.0.0:',
					'  version "1.0.0"',
					'  resolved "https://registry.yarnpkg.com/lockb-pkg/-/lockb-pkg-1.0.0.tgz"',
					'',
				].join('\n');
			},
			findJsonKeyLine() { return 0; },
		},
	});
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'bun.lockb'), Buffer.from('binary content'));

	const reports = await runRule(rule, join(tmpDir, 'index.js'));

	t.equal(reports.length, 1, 'detects shrinkwrap in bun.lockb');
	t.equal(reports[0].data?.name, 'lockb-pkg', 'correct package name from bun.lockb');
	t.end();
});

test('shrinkwrap rule - bun.lockb binary with null content', async (t) => {
	const rule = await esmock('eslint-plugin-lockfile/rules/shrinkwrap.mjs', {}, {
		pacote: createMockPacote({}),
		'lockfile-tools/io': {
			loadBunLockbContent() { return null; },
			findJsonKeyLine() { return 0; },
		},
	});
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'bun.lockb'), Buffer.from('binary content'));

	const reports = await runRule(rule, join(tmpDir, 'index.js'));

	t.equal(reports.length, 0, 'no errors when bun.lockb content is null');
	t.end();
});

test('shrinkwrap rule - pnpm-lock.yaml key where name regex does not match', async (t) => {
	const rule = await createMockedRule({
		'@@@unknown': { _hasShrinkwrap: false },
	});
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'pnpm-lock.yaml'), [
		'lockfileVersion: "9.0"',
		'',
		'packages:',
		'  @@:',
		'    resolution: {integrity: sha512-abc==}',
		'',
	].join('\n'));

	const reports = await runRule(rule, join(tmpDir, 'index.js'));

	t.equal(reports.length, 0, 'handles pnpm key where name regex does not match');
	t.end();
});

test('shrinkwrap rule - npa throws non-Error value', async (t) => {
	const rule = await esmock('eslint-plugin-lockfile/rules/shrinkwrap.mjs', {}, {
		pacote: createMockPacote({}),
		'npm-package-arg': function (/** @type {string} */ spec) {
			if (spec === 'throw-string') {
				throw 'not an error object'; // eslint-disable-line no-throw-literal
			}
			return {
				name: spec,
				rawSpec: '',
				registry: true,
			};
		},
	});
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3 }));

	const reports = await runRule(rule, join(tmpDir, 'index.js'), ['throw-string']);

	t.ok(reports.some((r) => r.messageId === 'invalidIgnoreEntry'), 'reports invalidIgnoreEntry');
	t.ok(
		reports.some((r) => r.data?.error === 'not an error object'),
		'uses String(e) for non-Error thrown value from npa',
	);
	t.end();
});
