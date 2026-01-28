import test from 'tape';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createESLint } from './helpers/eslint-compat.mjs';
import plugin from 'eslint-plugin-lockfile';

test('binary-conflicts rule - malformed package-lock.json does not crash', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'package-lock.json'), '{"lockfileVersion": 3, "packages": {invalid json}}');
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: { 'lockfile/binary-conflicts': 'error' },
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.ok(results.length > 0, 'ESLint ran successfully');
		// Malformed lockfiles may report errors or be skipped - either is acceptable
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('binary-conflicts rule - npm v1 with scoped and nested dependencies', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
			name: 'test',
			dependencies: {
				'@babel/core': '^7.0.0',
			},
		}));
		writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
			lockfileVersion: 1,
			dependencies: {
				'@babel/core': {
					version: '7.24.0',
					resolved: 'https://registry.npmjs.org/@babel/core/-/core-7.24.0.tgz',
					dependencies: {
						'@babel/helper-compilation-targets': {
							version: '7.24.0',
							resolved: 'https://registry.npmjs.org/@babel/helper-compilation-targets/-/helper-compilation-targets-7.24.0.tgz',
						},
					},
				},
			},
		}));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: { 'lockfile/binary-conflicts': 'error' },
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors with scoped packages and nested dependencies');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('binary-conflicts rule - pnpm lockfile processes last package', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
			name: 'test',
			dependencies: {
				tape: '^5.0.0',
				eslint: '^8.0.0',
			},
		}));
		const pnpmLock = `lockfileVersion: '9.0'

packages:
  /tape@5.7.5:
    resolution: {integrity: sha512-xxx, tarball: https://registry.npmjs.org/tape/-/tape-5.7.5.tgz}
    engines: {node: '>=6'}

  /eslint@8.57.0:
    resolution: {integrity: sha512-yyy, tarball: https://registry.npmjs.org/eslint/-/eslint-8.57.0.tgz}
    engines: {node: ^12.22.0 || ^14.17.0 || >=16.0.0}`;

		writeFileSync(join(tmpDir, 'pnpm-lock.yaml'), pnpmLock);
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: { 'lockfile/binary-conflicts': 'error' },
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors with pnpm lockfile processing last package');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('binary-conflicts rule - vlt lockfile with valid nodes', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
			name: 'test',
			dependencies: {
				tape: '^5.0.0',
			},
		}));
		writeFileSync(join(tmpDir, 'vlt-lock.json'), JSON.stringify({
			nodes: {
				node1: ['5.7.5', 'tape', 'sha512-abc123'],
				node2: ['8.57.0', 'eslint', 'sha512-def456'],
			},
		}));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: { 'lockfile/binary-conflicts': 'error' },
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors with vlt lockfile with valid nodes');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('binary-conflicts rule - skips workspace packages with link: true', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
			name: 'test-monorepo',
			workspaces: ['packages/*'],
		}));
		// npm lockfile with workspace packages (link: true)
		writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
			lockfileVersion: 3,
			packages: {
				'': {
					name: 'test-monorepo',
					workspaces: ['packages/*'],
				},
				'node_modules/@myorg/tasks': {
					resolved: 'packages/tasks',
					link: true,
				},
				'packages/tasks': {
					name: '@myorg/tasks',
					version: '0.0.1',
				},
			},
		}));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: { 'lockfile/binary-conflicts': 'error' },
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		// Workspace packages should be skipped
		t.equal(results[0].errorCount, 0, 'no errors - workspace packages skipped');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

import esmock from 'esmock';

/**
 * Create a mocked binary-conflicts rule with custom pacote manifests
 * @param {Record<string, object>} manifests - spec -> manifest mapping
 */
async function createMockedRule(manifests) {
	return esmock('eslint-plugin-lockfile/rules/binary-conflicts.mjs', {}, {
		pacote: {
			async manifest(/** @type {string} */ spec) {
				if (spec in manifests) {
					return manifests[spec];
				}
				throw new Error(`404 Not Found - ${spec}`);
			},
		},
	});
}

/**
 * Run the rule's Program handler directly with a mock context
 * @param {import('eslint').Rule.RuleModule} rule - The ESLint rule module
 * @param {string} testFile - The filename to use in context
 * @returns {Promise<any[]>} - Array of report calls
 */
async function runRule(rule, testFile) {
	/** @type {any[]} */
	const reports = [];
	const context = /** @type {import('eslint').Rule.RuleContext} */ (/** @type {*} */ ({
		filename: testFile,
		options: [],
		report(/** @type {object} */ info) { reports.push(info); },
	}));
	const ruleInstance = rule.create(context);
	// @ts-expect-error mock node
	// eslint-disable-next-line new-cap
	await ruleInstance.Program(/** @type {*} */ ({ type: 'Program' }));
	return reports;
}

test('binary-conflicts rule - no package.json (existsSync false branch)', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	// Write a lockfile but NO package.json
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 3,
		packages: {
			'': { name: 'test' },
			'node_modules/semver': { version: '7.6.0' },
		},
	}));
	writeFileSync(join(tmpDir, 'index.js'), 'var x = 1;');

	const rule = await createMockedRule({
		'semver@7.6.0': { bin: { semver: 'bin/semver.js' } },
	});

	const reports = await runRule(rule, join(tmpDir, 'index.js'));
	t.equal(reports.length, 0, 'no errors when package.json is missing');

	t.end();
});

test('binary-conflicts rule - v2/v3 package without version (unknown fallback)', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: { 'pkg-a': '*' },
	}));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 3,
		packages: {
			'': { name: 'test' },
			'node_modules/pkg-a': {},
		},
	}));
	writeFileSync(join(tmpDir, 'index.js'), 'var x = 1;');

	const rule = await createMockedRule({
		'pkg-a@undefined': { bin: { mycli: 'bin/cli.js' } },
	});

	const reports = await runRule(rule, join(tmpDir, 'index.js'));
	// The package has no version, so it should use 'unknown' fallback
	t.ok(Array.isArray(reports), 'rule ran without error');

	t.end();
});

test('binary-conflicts rule - v1 dep without version (unknown fallback)', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: { 'pkg-x': '*' },
	}));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 1,
		dependencies: {
			'pkg-x': {
				resolved: 'https://registry.npmjs.org/pkg-x/-/pkg-x-1.0.0.tgz',
			},
		},
	}));
	writeFileSync(join(tmpDir, 'index.js'), 'var x = 1;');

	const rule = await createMockedRule({
		'pkg-x@undefined': { bin: { pkgx: 'bin/cli.js' } },
	});

	const reports = await runRule(rule, join(tmpDir, 'index.js'));
	t.ok(Array.isArray(reports), 'rule ran without error for v1 dep without version');

	t.end();
});

test('binary-conflicts rule - v1 dep with falsy packageName', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: {},
	}));
	// A dep whose name splits on '/' and pop() could yield empty string
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 1,
		dependencies: {
			'some-dep': {
				version: '1.0.0',
				resolved: 'https://registry.npmjs.org/some-dep/-/some-dep-1.0.0.tgz',
			},
		},
	}));
	writeFileSync(join(tmpDir, 'index.js'), 'var x = 1;');

	const rule = await createMockedRule({
		'some-dep@1.0.0': { bin: { sd: 'bin/sd.js' } },
	});

	const reports = await runRule(rule, join(tmpDir, 'index.js'));
	t.ok(Array.isArray(reports), 'rule ran without error for falsy packageName path');

	t.end();
});

test('binary-conflicts rule - yarn lockfile with unknown version fallback', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: { 'some-pkg': '*' },
	}));
	// Yarn lockfile entry with no version field
	const yarnLock = '# yarn lockfile v1\n\nsome-pkg@*:\n  resolved "https://registry.yarnpkg.com/some-pkg/-/some-pkg-1.0.0.tgz"\n';
	writeFileSync(join(tmpDir, 'yarn.lock'), yarnLock);
	writeFileSync(join(tmpDir, 'index.js'), 'var x = 1;');

	const rule = await createMockedRule({
		'some-pkg@unknown': { bin: { sp: 'bin/sp.js' } },
	});

	const reports = await runRule(rule, join(tmpDir, 'index.js'));
	t.ok(Array.isArray(reports), 'rule ran without error for yarn entry without version');

	t.end();
});

test('binary-conflicts rule - pnpm name regex miss', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: {},
	}));
	// A pnpm lockfile entry where the package key doesn't match the name regex
	const pnpmLock = "lockfileVersion: '9.0'\n\npackages:\n  /@oddpkg:\n    resolution: {integrity: sha512-abc}\n";
	writeFileSync(join(tmpDir, 'pnpm-lock.yaml'), pnpmLock);
	writeFileSync(join(tmpDir, 'index.js'), 'var x = 1;');

	const rule = await createMockedRule({});

	const reports = await runRule(rule, join(tmpDir, 'index.js'));
	t.ok(Array.isArray(reports), 'rule ran without error for pnpm name regex miss');

	t.end();
});

test('binary-conflicts rule - pnpm last package with version regex miss', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: {},
	}));
	// A pnpm lockfile where the last package entry has no version (no @version suffix)
	const pnpmLock = "lockfileVersion: '9.0'\n\npackages:\n  noversion:\n    resolution: {integrity: sha512-xyz}\n";
	writeFileSync(join(tmpDir, 'pnpm-lock.yaml'), pnpmLock);
	writeFileSync(join(tmpDir, 'index.js'), 'var x = 1;');

	const rule = await createMockedRule({
		'noversion@unknown': { bin: { nv: 'bin/nv.js' } },
	});

	const reports = await runRule(rule, join(tmpDir, 'index.js'));
	t.ok(Array.isArray(reports), 'rule ran without error for pnpm last package version regex miss');

	t.end();
});

test('binary-conflicts rule - bun.lockb with null content', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'bun.lockb'), Buffer.from([0x00]));
	writeFileSync(join(tmpDir, 'index.js'), 'var x = 1;');

	const rule = await esmock('eslint-plugin-lockfile/rules/binary-conflicts.mjs', {}, {
		pacote: {
			async manifest() { return {}; },
		},
		'lockfile-tools/io': {
			loadBunLockbContent() { return null; },
			findJsonKeyLine() { return 0; },
		},
	});

	const reports = await runRule(rule, join(tmpDir, 'index.js'));
	t.ok(Array.isArray(reports), 'rule ran without error when bun.lockb content is null');

	t.end();
});

test('binary-conflicts rule - context.getFilename() fallback', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 3,
		packages: {
			'': { name: 'test' },
		},
	}));

	const rule = await createMockedRule({});

	// Use a context without `filename` property, only `getFilename()`
	/** @type {object[]} */
	const reports = [];
	const testFile = join(tmpDir, 'index.js');
	const context = /** @type {import('eslint').Rule.RuleContext} */ (/** @type {*} */ ({
		filename: undefined,
		getFilename() { return testFile; },
		options: [],
		report(/** @type {object} */ info) { reports.push(info); },
	}));
	const ruleInstance = rule.create(context);
	// eslint-disable-next-line new-cap
	await ruleInstance.Program(/** @type {*} */ ({ type: 'Program' }));

	t.ok(Array.isArray(reports), 'rule ran with getFilename() fallback');

	t.end();
});

test('binary-conflicts rule - virtual lockfile binary conflict', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: {
			'pkg-a': '1.0.0',
		},
	}));
	// No lockfile - triggers virtual lockfile path
	writeFileSync(join(tmpDir, 'index.js'), 'var x = 1;');

	const rule = await esmock('eslint-plugin-lockfile/rules/binary-conflicts.mjs', {}, {
		pacote: {
			async manifest(/** @type {string} */ spec) {
				if (spec === 'pkg-a@1.0.0') {
					return { bin: { mycli: 'bin/a.js' } };
				}
				if (spec === 'pkg-b@2.0.0') {
					return { bin: { mycli: 'bin/b.js' } };
				}
				throw new Error(`404 Not Found - ${spec}`);
			},
		},
		'lockfile-tools/virtual': {
			hasLockfile() { return false; },
			buildVirtualLockfile() {
				return Promise.resolve([
					{
						name: 'pkg-a',
						version: '1.0.0',
						isDirect: true,
					},
					{
						name: 'pkg-b',
						version: '2.0.0',
						isDirect: false,
					},
				]);
			},
		},
	});

	const reports = await runRule(rule, join(tmpDir, 'index.js'));
	t.ok(reports.length > 0, 'virtual lockfile binary conflict reported');
	t.equal(reports[0].messageId, 'binaryConflictWithPreference', 'reports conflict with preference for direct dep');
	t.equal(reports[0].data.binary, 'mycli', 'conflict is on mycli binary');
	// line is 0 for virtual, so loc should be undefined
	t.equal(reports[0].loc, undefined, 'loc is undefined for virtual lockfile (line 0)');

	t.end();
});

test('binary-conflicts rule - virtual lockfile conflict without direct dep preference', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: {},
	}));
	writeFileSync(join(tmpDir, 'index.js'), 'var x = 1;');

	const rule = await esmock('eslint-plugin-lockfile/rules/binary-conflicts.mjs', {}, {
		pacote: {
			async manifest(/** @type {string} */ spec) {
				if (spec === 'pkg-a@1.0.0') {
					return { bin: { mycli: 'bin/a.js' } };
				}
				if (spec === 'pkg-b@2.0.0') {
					return { bin: { mycli: 'bin/b.js' } };
				}
				throw new Error(`404 Not Found - ${spec}`);
			},
		},
		'lockfile-tools/virtual': {
			hasLockfile() { return false; },
			buildVirtualLockfile() {
				return Promise.resolve([
					{
						name: 'pkg-a',
						version: '1.0.0',
						isDirect: false,
					},
					{
						name: 'pkg-b',
						version: '2.0.0',
						isDirect: false,
					},
				]);
			},
		},
	});

	const reports = await runRule(rule, join(tmpDir, 'index.js'));
	t.ok(reports.length > 0, 'virtual lockfile binary conflict reported without preference');
	t.equal(reports[0].messageId, 'binaryConflict', 'reports generic binary conflict');

	t.end();
});

test('binary-conflicts rule - non-Error thrown value in lockfile parsing', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'package-lock.json'), '{}');
	writeFileSync(join(tmpDir, 'index.js'), 'var x = 1;');

	const rule = await esmock('eslint-plugin-lockfile/rules/binary-conflicts.mjs', {}, {
		pacote: {
			async manifest() { return {}; },
		},
		'lockfile-tools/parsers': {
			parseYarnLockfile() { return []; },
			createLockfileExtractor() {
				return () => {
					throw 'string error'; // eslint-disable-line no-throw-literal
				};
			},
		},
	});

	const reports = await runRule(rule, join(tmpDir, 'index.js'));
	const malformedReport = reports.filter((r) => r.messageId === 'malformedLockfile');
	t.ok(malformedReport.length > 0, 'malformed lockfile error reported');
	t.equal(malformedReport[0].data.error, 'string error', 'non-Error value stringified correctly');

	t.end();
});

test('binary-conflicts rule - v1 3-level nested deps (truthy prefix branch)', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: { parent: '1.0.0' },
	}));
	// 3 levels of nesting so that the recursive call has prefix='parent'
	// and the inner dep also has dependencies, exercising line 154 truthy branch
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 1,
		dependencies: {
			parent: {
				version: '1.0.0',
				resolved: 'https://registry.npmjs.org/parent/-/parent-1.0.0.tgz',
				dependencies: {
					child: {
						version: '2.0.0',
						resolved: 'https://registry.npmjs.org/child/-/child-2.0.0.tgz',
						dependencies: {
							grandchild: {
								version: '3.0.0',
								resolved: 'https://registry.npmjs.org/grandchild/-/grandchild-3.0.0.tgz',
							},
						},
					},
				},
			},
		},
	}));
	writeFileSync(join(tmpDir, 'index.js'), 'var x = 1;');

	const rule = await createMockedRule({
		'parent@1.0.0': { bin: { mycli: 'bin/a.js' } },
		'child@2.0.0': { bin: { mycli: 'bin/b.js' } },
		'grandchild@3.0.0': { bin: { mycli: 'bin/c.js' } },
	});

	const reports = await runRule(rule, join(tmpDir, 'index.js'));
	t.ok(Array.isArray(reports), 'rule ran with 3-level nested v1 deps');

	t.end();
});

test('binary-conflicts rule - v1 dep with name ending in / (packageName falsy)', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: {},
	}));
	// A dep name containing / where pop() yields empty string
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 1,
		dependencies: {
			'trailing/': {
				version: '1.0.0',
				resolved: 'https://registry.npmjs.org/x/-/x-1.0.0.tgz',
			},
		},
	}));
	writeFileSync(join(tmpDir, 'index.js'), 'var x = 1;');

	const rule = await createMockedRule({
		'@1.0.0': {},
	});

	const reports = await runRule(rule, join(tmpDir, 'index.js'));
	t.ok(Array.isArray(reports), 'rule ran for v1 dep with trailing slash in name');

	t.end();
});

test('binary-conflicts rule - yarn lockfile entry with no name match', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: {},
	}));
	// yarn entry where name starts with @@ so regex ^(@?[^@]+) might not match
	const yarnLock = '# yarn lockfile v1\n\n@@bad-name:\n  version "1.0.0"\n  resolved "https://registry.yarnpkg.com/x/-/x-1.0.0.tgz"\n';
	writeFileSync(join(tmpDir, 'yarn.lock'), yarnLock);
	writeFileSync(join(tmpDir, 'index.js'), 'var x = 1;');

	const rule = await createMockedRule({
		'@@bad-name@unknown': {},
	});

	const reports = await runRule(rule, join(tmpDir, 'index.js'));
	t.ok(Array.isArray(reports), 'rule ran for yarn entry with unusual name');

	t.end();
});

test('binary-conflicts rule - pnpm: version regex miss (middle) and name regex miss (last)', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: {},
	}));
	// First entry 'noversion' has no @version suffix → version regex misses on save
	// Last entry '@@badname' → name regex ^(@?[^@]+) fails on last-package save
	const pnpmLock = "lockfileVersion: '9.0'\n\npackages:\n  noversion:\n    resolution: {integrity: sha512-aaa}\n  @@badname:\n    resolution: {integrity: sha512-bbb}\n";
	writeFileSync(join(tmpDir, 'pnpm-lock.yaml'), pnpmLock);
	writeFileSync(join(tmpDir, 'index.js'), 'var x = 1;');

	const rule = await createMockedRule({
		'noversion@unknown': {},
		'@@badname@badname': {},
	});

	const reports = await runRule(rule, join(tmpDir, 'index.js'));
	t.ok(Array.isArray(reports), 'rule ran for pnpm entries with regex misses');

	t.end();
});

test('binary-conflicts rule - lockfile conflict with loc defined (non-virtual)', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: {
			'pkg-a': '1.0.0',
			'pkg-b': '2.0.0',
		},
	}));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 3,
		packages: {
			'': { name: 'test' },
			'node_modules/pkg-a': { version: '1.0.0' },
			'node_modules/pkg-b': { version: '2.0.0' },
		},
	}, null, 2));
	writeFileSync(join(tmpDir, 'index.js'), 'var x = 1;');

	const rule = await createMockedRule({
		'pkg-a@1.0.0': { bin: { samecli: 'bin/a.js' } },
		'pkg-b@2.0.0': { bin: { samecli: 'bin/b.js' } },
	});

	const reports = await runRule(rule, join(tmpDir, 'index.js'));
	t.ok(reports.length > 0, 'conflict reported');
	// With pretty-printed JSON, findJsonKeyLine should find a valid line > 0
	const conflict = reports.find((r) => r.messageId === 'binaryConflictWithPreference' || r.messageId === 'binaryConflict');
	t.ok(conflict, 'conflict message found');
	if (conflict && conflict.loc) {
		t.ok(conflict.loc.start.line > 0, 'loc is defined with valid line number');
	}

	t.end();
});

test('binary-conflicts rule - lockfile conflict with guaranteed loc (line 447 truthy branch)', async (t) => {
	const { readFileSync } = await import('fs');
	const { basename } = await import('path');
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: {
			'pkg-a': '1.0.0',
			'pkg-b': '2.0.0',
		},
	}));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 3,
		packages: {
			'': { name: 'test' },
			'node_modules/pkg-a': { version: '1.0.0' },
			'node_modules/pkg-b': { version: '2.0.0' },
		},
	}, null, 2));
	writeFileSync(join(tmpDir, 'index.js'), 'var x = 1;');

	// Mock findJsonKeyLine to always return a positive line number
	const rule = await esmock('eslint-plugin-lockfile/rules/binary-conflicts.mjs', {}, {
		pacote: {
			async manifest(/** @type {string} */ spec) {
				if (spec === 'pkg-a@1.0.0') {
					return { bin: { samecli: 'bin/a.js' } };
				}
				if (spec === 'pkg-b@2.0.0') {
					return { bin: { samecli: 'bin/b.js' } };
				}
				throw new Error(`404 - ${spec}`);
			},
		},
		'lockfile-tools/io': {
			loadLockfileContent(/** @type {string} */ filepath) {
				try {
					return readFileSync(filepath, 'utf8');
				} catch {
					return null;
				}
			},
			findJsonKeyLine() { return 5; },
			getLockfileName(/** @type {string} */ filepath) {
				return basename(filepath);
			},
			loadBunLockbContent() { return null; },
		},
	});

	const reports = await runRule(rule, join(tmpDir, 'index.js'));
	t.ok(reports.length > 0, 'conflict reported');
	const conflict = reports.find((r) => r.messageId === 'binaryConflictWithPreference' || r.messageId === 'binaryConflict');
	t.ok(conflict, 'conflict message found');
	t.ok(conflict.loc, 'loc is defined');
	t.equal(conflict.loc.start.line, 5, 'loc uses line from findJsonKeyLine');

	t.end();
});

test('binary-conflicts rule - vlt lockfile without nodes key (line 313 falsy branch)', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	// vlt-lock.json without a "nodes" key
	writeFileSync(join(tmpDir, 'vlt-lock.json'), JSON.stringify({
		lockfileVersion: 0,
	}));
	writeFileSync(join(tmpDir, 'index.js'), 'var x = 1;');

	const rule = await createMockedRule({});

	const reports = await runRule(rule, join(tmpDir, 'index.js'));
	t.ok(Array.isArray(reports), 'rule ran without error for vlt lockfile without nodes');

	t.end();
});

test('binary-conflicts rule - yarn entry with otherFields.version missing (unknown fallback)', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: {},
	}));
	// yarn entry without version field - otherFields.version will be undefined
	const yarnLock = '# yarn lockfile v1\n\nsome-pkg@*:\n  resolved "https://registry.yarnpkg.com/some-pkg/-/some-pkg-1.0.0.tgz"\n';
	writeFileSync(join(tmpDir, 'yarn.lock'), yarnLock);
	writeFileSync(join(tmpDir, 'index.js'), 'var x = 1;');

	const rule = await createMockedRule({
		'some-pkg@unknown': { bin: { sp: 'bin/sp.js' } },
	});

	const reports = await runRule(rule, join(tmpDir, 'index.js'));
	t.ok(Array.isArray(reports), 'rule ran for yarn entry without version');

	t.end();
});
