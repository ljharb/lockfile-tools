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
