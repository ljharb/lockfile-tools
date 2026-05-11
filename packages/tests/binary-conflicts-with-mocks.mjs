import test from 'tape';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import esmock from 'esmock';
import { createMockPacote } from './fixtures/packuments/loader.mjs';

// Create mock pacote using packument fixtures
// These fixtures are stored in test/fixtures/packuments/ and can be updated with:
// npm run fetch-packument <package@version>
const mockedPacote = createMockPacote([
	'gulp@4.0.2',
	'gulp-cli@2.3.0',
	'tape@5.7.5',
	'eslint@8.57.0',
	'mocha@10.0.0',
]);

const recordingPacote = (() => {
	/** @type {string[]} */
	const seen = [];
	return {
		seen,
		/** @param {string} spec */
		async manifest(spec) {
			seen.push(spec);
			throw new Error(`recordingPacote should not be invoked for spec: ${spec}`);
		},
	};
})();

// Import the binary-conflicts rule with pacote mocked
const binaryConflictsRule = await esmock('eslint-plugin-lockfile/rules/binary-conflicts.mjs', {}, {
	pacote: mockedPacote,
});

test('binary-conflicts rule - gulp and gulp-cli conflict in npm lockfile v3', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: {
			gulp: '^4.0.0',
			'gulp-cli': '^2.0.0',
		},
	}));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 3,
		packages: {
			'': {
				name: 'test',
				dependencies: {
					gulp: '^4.0.0',
					'gulp-cli': '^2.0.0',
				},
			},
			'node_modules/gulp': {
				version: '4.0.2',
				resolved: 'https://registry.npmjs.org/gulp/-/gulp-4.0.2.tgz',
			},
			'node_modules/gulp-cli': {
				version: '2.3.0',
				resolved: 'https://registry.npmjs.org/gulp-cli/-/gulp-cli-2.3.0.tgz',
			},
		},
	}));
	const testFile = join(tmpDir, 'index.js');
	writeFileSync(testFile, 'const x = 1;');

	/** @type {{ messageId?: string; data?: Record<string, unknown> }[]} */
	const reports = [];
	const context = {
		filename: testFile,
		/** @param {{messageId?: string; data?: Record<string, unknown> }} info */
		report(info) {
			reports.push(info);
		},
	};

	const ruleInstance = binaryConflictsRule.create(context);
	// eslint-disable-next-line new-cap
	await ruleInstance.Program({ type: 'Program' });

	t.ok(reports.length > 0, 'error reported for binary conflict');
	t.ok(reports.some((r) => r.data?.binary === 'gulp'), 'error mentions gulp binary');
	t.ok(
		reports.some((r) => String(r.data?.packages).includes('gulp@4.0.2') || String(r.data?.packages).includes('gulp-cli@2.3.0')),
		'error mentions conflicting packages',
	);
	t.end();
});

test('binary-conflicts rule - direct dependency preference in npm lockfile', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	// Only gulp-cli is a direct dependency, gulp is transitive
	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: {
			'gulp-cli': '^2.0.0',
		},
	}));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 3,
		packages: {
			'': {
				name: 'test',
				dependencies: {
					'gulp-cli': '^2.0.0',
				},
			},
			'node_modules/gulp': {
				version: '4.0.2',
				resolved: 'https://registry.npmjs.org/gulp/-/gulp-4.0.2.tgz',
			},
			'node_modules/gulp-cli': {
				version: '2.3.0',
				resolved: 'https://registry.npmjs.org/gulp-cli/-/gulp-cli-2.3.0.tgz',
			},
		},
	}));
	const testFile = join(tmpDir, 'index.js');
	writeFileSync(testFile, 'const x = 1;');

	/** @type {{ messageId?: string; data?: Record<string, unknown> }[]} */
	const reports = [];
	const context = {
		filename: testFile,
		/** @param {{messageId?: string; data?: Record<string, unknown> }} info */
		report(info) {
			reports.push(info);
		},
	};

	const ruleInstance = binaryConflictsRule.create(context);
	// eslint-disable-next-line new-cap
	await ruleInstance.Program({ type: 'Program' });

	t.ok(reports.length > 0, 'error reported for binary conflict with preference');
	t.ok(reports.some((r) => r.messageId === 'binaryConflictWithPreference'), 'error mentions direct dependency preference');
	t.ok(reports.some((r) => String(r.data?.active).includes('gulp-cli@2.3.0')), 'error mentions gulp-cli as active');
	t.end();
});

test('binary-conflicts rule - npm v1 lockfile with conflicting bins', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: {
			gulp: '^4.0.0',
			'gulp-cli': '^2.0.0',
		},
	}));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 1,
		dependencies: {
			gulp: {
				version: '4.0.2',
				resolved: 'https://registry.npmjs.org/gulp/-/gulp-4.0.2.tgz',
			},
			'gulp-cli': {
				version: '2.3.0',
				resolved: 'https://registry.npmjs.org/gulp-cli/-/gulp-cli-2.3.0.tgz',
			},
		},
	}));
	const testFile = join(tmpDir, 'index.js');
	writeFileSync(testFile, 'const x = 1;');

	/** @type {{ messageId?: string; data?: Record<string, unknown> }[]} */
	const reports = [];
	const context = {
		filename: testFile,
		/** @param {{messageId?: string; data?: Record<string, unknown> }} info */
		report(info) {
			reports.push(info);
		},
	};

	const ruleInstance = binaryConflictsRule.create(context);
	// eslint-disable-next-line new-cap
	await ruleInstance.Program({ type: 'Program' });

	t.ok(reports.length > 0, 'error reported for npm v1 binary conflict');
	t.ok(reports.some((r) => r.data?.binary === 'gulp'), 'error mentions gulp binary');
	t.end();
});

test('binary-conflicts rule - npm v1 with nested dependencies', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: {
			gulp: '^4.0.0',
		},
	}));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 1,
		dependencies: {
			gulp: {
				version: '4.0.2',
				resolved: 'https://registry.npmjs.org/gulp/-/gulp-4.0.2.tgz',
				dependencies: {
					'gulp-cli': {
						version: '2.3.0',
						resolved: 'https://registry.npmjs.org/gulp-cli/-/gulp-cli-2.3.0.tgz',
					},
				},
			},
		},
	}));
	const testFile = join(tmpDir, 'index.js');
	writeFileSync(testFile, 'const x = 1;');

	/** @type {{ messageId?: string; data?: Record<string, unknown> }[]} */
	const reports = [];
	const context = {
		filename: testFile,
		/** @param {{messageId?: string; data?: Record<string, unknown> }} info */
		report(info) {
			reports.push(info);
		},
	};

	const ruleInstance = binaryConflictsRule.create(context);
	// eslint-disable-next-line new-cap
	await ruleInstance.Program({ type: 'Program' });

	t.ok(reports.length > 0, 'error reported for nested dependency conflict');
	t.ok(reports.some((r) => r.data?.binary === 'gulp'), 'error mentions gulp binary');
	t.end();
});

test('binary-conflicts rule - yarn lockfile with conflicting bins', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: {
			gulp: '^4.0.0',
			'gulp-cli': '^2.0.0',
		},
	}));
	const yarnLock = `# THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.
# yarn lockfile v1

gulp@^4.0.0:
  version "4.0.2"
  resolved "https://registry.yarnpkg.com/gulp/-/gulp-4.0.2.tgz"

gulp-cli@^2.0.0:
  version "2.3.0"
  resolved "https://registry.yarnpkg.com/gulp-cli/-/gulp-cli-2.3.0.tgz"`;

	writeFileSync(join(tmpDir, 'yarn.lock'), yarnLock);
	const testFile = join(tmpDir, 'index.js');
	writeFileSync(testFile, 'const x = 1;');

	/** @type {{ messageId?: string; data?: Record<string, unknown> }[]} */
	const reports = [];
	const context = {
		filename: testFile,
		/** @param {{messageId?: string; data?: Record<string, unknown> }} info */
		report(info) {
			reports.push(info);
		},
	};

	const ruleInstance = binaryConflictsRule.create(context);
	// eslint-disable-next-line new-cap
	await ruleInstance.Program({ type: 'Program' });

	t.ok(reports.length > 0, 'error reported for yarn lockfile conflict');
	t.ok(reports.some((r) => r.data?.binary === 'gulp'), 'error mentions gulp binary');
	t.end();
});

test('binary-conflicts rule - pnpm lockfile with conflicting bins', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: {
			gulp: '^4.0.0',
			'gulp-cli': '^2.0.0',
		},
	}));
	const pnpmLock = `lockfileVersion: '9.0'

packages:
  /gulp@4.0.2:
    resolution: {tarball: https://registry.npmjs.org/gulp/-/gulp-4.0.2.tgz}

  /gulp-cli@2.3.0:
    resolution: {tarball: https://registry.npmjs.org/gulp-cli/-/gulp-cli-2.3.0.tgz}`;

	writeFileSync(join(tmpDir, 'pnpm-lock.yaml'), pnpmLock);
	const testFile = join(tmpDir, 'index.js');
	writeFileSync(testFile, 'const x = 1;');

	/** @type {{ messageId?: string; data?: Record<string, unknown> }[]} */
	const reports = [];
	const context = {
		filename: testFile,
		/** @param {{messageId?: string; data?: Record<string, unknown> }} info */
		report(info) {
			reports.push(info);
		},
	};

	const ruleInstance = binaryConflictsRule.create(context);
	// eslint-disable-next-line new-cap
	await ruleInstance.Program({ type: 'Program' });

	t.ok(reports.length > 0, 'error reported for pnpm lockfile conflict');
	t.ok(reports.some((r) => r.data?.binary === 'gulp'), 'error mentions gulp binary');
	t.end();
});

test('binary-conflicts rule - vlt lockfile with conflicting bins', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: {
			gulp: '^4.0.0',
			'gulp-cli': '^2.0.0',
		},
	}));
	writeFileSync(join(tmpDir, 'vlt-lock.json'), JSON.stringify({
		nodes: {
			node1: ['4.0.2', 'gulp', 'sha512-abc123'],
			node2: ['2.3.0', 'gulp-cli', 'sha512-def456'],
		},
	}));
	const testFile = join(tmpDir, 'index.js');
	writeFileSync(testFile, 'const x = 1;');

	/** @type {{ messageId?: string; data?: Record<string, unknown> }[]} */
	const reports = [];
	const context = {
		filename: testFile,
		/** @param {{messageId?: string; data?: Record<string, unknown> }} info */
		report(info) {
			reports.push(info);
		},
	};

	const ruleInstance = binaryConflictsRule.create(context);
	// eslint-disable-next-line new-cap
	await ruleInstance.Program({ type: 'Program' });

	t.ok(reports.length > 0, 'error reported for vlt lockfile conflict');
	t.ok(reports.some((r) => r.data?.binary === 'gulp'), 'error mentions gulp binary');
	t.end();
});

test('binary-conflicts rule - no conflict with different bins', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: {
			tape: '^5.0.0',
			eslint: '^8.0.0',
		},
	}));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 3,
		packages: {
			'': {
				name: 'test',
				dependencies: {
					tape: '^5.0.0',
					eslint: '^8.0.0',
				},
			},
			'node_modules/tape': {
				version: '5.7.5',
				resolved: 'https://registry.npmjs.org/tape/-/tape-5.7.5.tgz',
			},
			'node_modules/eslint': {
				version: '8.57.0',
				resolved: 'https://registry.npmjs.org/eslint/-/eslint-8.57.0.tgz',
			},
		},
	}));
	const testFile = join(tmpDir, 'index.js');
	writeFileSync(testFile, 'const x = 1;');

	/** @type {{ messageId?: string; data?: Record<string, unknown> }[]} */
	const reports = [];
	const context = {
		filename: testFile,
		/** @param {{messageId?: string; data?: Record<string, unknown> }} info */
		report(info) {
			reports.push(info);
		},
	};

	const ruleInstance = binaryConflictsRule.create(context);
	// eslint-disable-next-line new-cap
	await ruleInstance.Program({ type: 'Program' });

	t.equal(reports.length, 0, 'no errors when different bins are provided');
	t.end();
});

test('binary-conflicts rule - package with multiple bins', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: {
			mocha: '^10.0.0',
		},
	}));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 3,
		packages: {
			'': {
				name: 'test',
				dependencies: {
					mocha: '^10.0.0',
				},
			},
			'node_modules/mocha': {
				version: '10.0.0',
				resolved: 'https://registry.npmjs.org/mocha/-/mocha-10.0.0.tgz',
			},
		},
	}));
	const testFile = join(tmpDir, 'index.js');
	writeFileSync(testFile, 'const x = 1;');

	/** @type {{ messageId?: string; data?: Record<string, unknown> }[]} */
	const reports = [];
	const context = {
		filename: testFile,
		/** @param {{messageId?: string; data?: Record<string, unknown> }} info */
		report(info) {
			reports.push(info);
		},
	};

	const ruleInstance = binaryConflictsRule.create(context);
	// eslint-disable-next-line new-cap
	await ruleInstance.Program({ type: 'Program' });

	t.equal(reports.length, 0, 'no errors when package has multiple bins');
	t.end();
});

test('binary-conflicts rule - allowedHosts option blocks unlisted hosts', async (t) => {
	recordingPacote.seen.length = 0;
	const rule = await esmock('eslint-plugin-lockfile/rules/binary-conflicts.mjs', {}, {
		pacote: recordingPacote,
	});

	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 3,
		packages: {
			'': { name: 'test' },
			'node_modules/git-pkg': {
				version: 'git+https://attacker.test/x.git#main',
				resolved: 'https://registry.npmjs.org/git-pkg/-/git-pkg-1.0.0.tgz',
			},
			'node_modules/remote-pkg': {
				version: 'https://attacker.test/x.tgz',
				resolved: 'https://registry.npmjs.org/remote-pkg/-/remote-pkg-1.0.0.tgz',
			},
		},
	}));
	const testFile = join(tmpDir, 'index.js');
	writeFileSync(testFile, 'const x = 1;');

	/** @type {unknown[]} */
	const reports = [];
	const context = {
		filename: testFile,
		options: [{ allowedHosts: [] }],
		/** @param {unknown} info */
		report(info) {
			reports.push(info);
		},
	};

	const ruleInstance = rule.create(context);
	// eslint-disable-next-line new-cap
	await ruleInstance.Program({ type: 'Program' });

	t.deepEqual(recordingPacote.seen, [], 'pacote.manifest is not called for git/remote specs when allowedHosts is empty');
	t.equal(reports.length, 0, 'no binary-conflict diagnostics for skipped packages');
	t.end();
});

test('binary-conflicts rule - allowedHosts option permits matching hosts', async (t) => {
	recordingPacote.seen.length = 0;
	const recordingThenManifest = {
		/** @type {string[]} */
		seen: recordingPacote.seen,
		/** @param {string} spec */
		async manifest(spec) {
			recordingPacote.seen.push(spec);
			return { name: 'irrelevant', version: '1.0.0' };
		},
	};
	const rule = await esmock('eslint-plugin-lockfile/rules/binary-conflicts.mjs', {}, {
		pacote: recordingThenManifest,
	});

	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 3,
		packages: {
			'': { name: 'test' },
			'node_modules/safe-git': {
				version: 'git+https://github.com/user/safe.git#main',
				resolved: 'https://registry.npmjs.org/safe-git/-/safe-git-1.0.0.tgz',
			},
			'node_modules/blocked-git': {
				version: 'git+https://attacker.test/x.git#main',
				resolved: 'https://registry.npmjs.org/blocked-git/-/blocked-git-1.0.0.tgz',
			},
		},
	}));
	const testFile = join(tmpDir, 'index.js');
	writeFileSync(testFile, 'const x = 1;');

	const context = {
		filename: testFile,
		options: [{ allowedHosts: ['github.com'] }],
		report() { /* discard */ },
	};

	const ruleInstance = rule.create(context);
	// eslint-disable-next-line new-cap
	await ruleInstance.Program({ type: 'Program' });

	t.ok(
		recordingPacote.seen.some((s) => s.includes('github.com')),
		'pacote was called for the github-hosted git spec',
	);
	t.ok(
		!recordingPacote.seen.some((s) => s.includes('attacker.test')),
		'pacote was not called for the unlisted host',
	);
	t.end();
});

test('binary-conflicts rule - default option (no allowedHosts) forwards every spec to pacote', async (t) => {
	/** @type {string[]} */
	const seen = [];
	const rule = await esmock('eslint-plugin-lockfile/rules/binary-conflicts.mjs', {}, {
		pacote: {
			/** @param {string} spec */
			async manifest(spec) {
				seen.push(spec);
				return { name: 'irrelevant', version: '1.0.0' };
			},
		},
	});

	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 3,
		packages: {
			'': { name: 'test' },
			'node_modules/git-pkg': {
				version: 'git+https://attacker.test/x.git#main',
				resolved: 'https://registry.npmjs.org/git-pkg/-/git-pkg-1.0.0.tgz',
			},
		},
	}));
	const testFile = join(tmpDir, 'index.js');
	writeFileSync(testFile, 'const x = 1;');

	const context = {
		filename: testFile,
		report() { /* discard */ },
	};

	const ruleInstance = rule.create(context);
	// eslint-disable-next-line new-cap
	await ruleInstance.Program({ type: 'Program' });

	t.ok(seen.some((s) => s.includes('attacker.test')), 'with no allowedHosts option, git spec is forwarded to pacote (backwards-compatible default)');
	t.end();
});

test('binary-conflicts rule - allowedHosts option supports file: globs', async (t) => {
	/** @type {string[]} */
	const seen = [];
	const rule = await esmock('eslint-plugin-lockfile/rules/binary-conflicts.mjs', {}, {
		pacote: {
			/** @param {string} spec */
			async manifest(spec) {
				seen.push(spec);
				return { name: 'irrelevant', version: '1.0.0' };
			},
		},
	});

	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 3,
		packages: {
			'': { name: 'test' },
			'node_modules/local-pkg': {
				version: 'file:./packages/local-pkg',
				resolved: 'file:./packages/local-pkg',
			},
			'node_modules/local-tgz': {
				version: 'file:./vendor/foo.tgz',
				resolved: 'file:./vendor/foo.tgz',
			},
			'node_modules/blocked-local': {
				version: 'file:./other/blocked',
				resolved: 'file:./other/blocked',
			},
		},
	}));
	const testFile = join(tmpDir, 'index.js');
	writeFileSync(testFile, 'const x = 1;');

	const context = {
		filename: testFile,
		options: [{ allowedHosts: ['file:./packages/**', 'file:./vendor/*.tgz'] }],
		report() { /* discard */ },
	};

	const ruleInstance = rule.create(context);
	// eslint-disable-next-line new-cap
	await ruleInstance.Program({ type: 'Program' });

	t.ok(seen.some((s) => s.includes('file:./packages/local-pkg')), 'file: directory spec matching glob is forwarded');
	t.ok(seen.some((s) => s.includes('file:./vendor/foo.tgz')), 'file: tarball spec matching glob is forwarded');
	t.notOk(seen.some((s) => s.includes('file:./other/blocked')), 'file: spec not matching any allowedHosts glob is blocked');
	t.end();
});

test('binary-conflicts rule - non-E404 pacote failures surface as fetchFailed', async (t) => {
	const rule = await esmock('eslint-plugin-lockfile/rules/binary-conflicts.mjs', {}, {
		pacote: {
			/** @param {string} spec */
			async manifest(spec) {
				const err = /** @type {Error & { code?: string }} */ (new Error(`network timeout for ${spec}`));
				err.code = 'ETIMEDOUT';
				throw err;
			},
		},
	});

	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 3,
		packages: {
			'': { name: 'test' },
			'node_modules/foo': {
				version: '1.0.0',
				resolved: 'https://registry.npmjs.org/foo/-/foo-1.0.0.tgz',
			},
		},
	}));
	const testFile = join(tmpDir, 'index.js');
	writeFileSync(testFile, 'const x = 1;');

	/** @type {{ messageId?: string; data?: Record<string, unknown> }[]} */
	const reports = [];
	const context = {
		filename: testFile,
		/** @param {{ messageId?: string; data?: Record<string, unknown> }} info */
		report(info) { reports.push(info); },
	};

	const ruleInstance = rule.create(context);
	// eslint-disable-next-line new-cap
	await ruleInstance.Program({ type: 'Program' });

	t.ok(reports.some((r) => r.messageId === 'fetchFailed'), 'fetchFailed messageId reported for ETIMEDOUT');
	t.ok(reports.some((r) => String(r.data?.error).includes('network timeout')), 'error message includes pacote error');
	t.end();
});

test('binary-conflicts rule - E404 is still silently skipped', async (t) => {
	const rule = await esmock('eslint-plugin-lockfile/rules/binary-conflicts.mjs', {}, {
		pacote: {
			/** @param {string} spec */
			async manifest(spec) {
				const err = /** @type {Error & { code?: string }} */ (new Error(`404 Not Found - ${spec}`));
				err.code = 'E404';
				throw err;
			},
		},
	});

	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 3,
		packages: {
			'': { name: 'test' },
			'node_modules/foo': {
				version: '1.0.0',
				resolved: 'https://registry.npmjs.org/foo/-/foo-1.0.0.tgz',
			},
		},
	}));
	const testFile = join(tmpDir, 'index.js');
	writeFileSync(testFile, 'const x = 1;');

	/** @type {{ messageId?: string; data?: Record<string, unknown> }[]} */
	const reports = [];
	const context = {
		filename: testFile,
		/** @param {{ messageId?: string; data?: Record<string, unknown> }} info */
		report(info) { reports.push(info); },
	};

	const ruleInstance = rule.create(context);
	// eslint-disable-next-line new-cap
	await ruleInstance.Program({ type: 'Program' });

	t.equal(reports.length, 0, 'no diagnostics when registry returns 404');
	t.end();
});
