import test from 'tape';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createESLint } from './helpers/eslint-compat.mjs';
import esmock from 'esmock';
import plugin from 'eslint-plugin-lockfile';

test('non-registry-specifiers - ignore with substring match in regular lockfile (line 323)', async (t) => {
	// This tests the .includes() branch of: resolved === entry.specifier || resolved.includes(entry.specifier)
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: {
			'my-package': '1.0.0',
		},
	}));

	// Package with git URL that contains 'my-internal-repo' as substring
	const packageLock = JSON.stringify({
		lockfileVersion: 3,
		packages: {
			'': {
				dependencies: {
					'my-package': '1.0.0',
				},
			},
			'node_modules/my-package': {
				version: '1.0.0',
				resolved: 'git+https://github.com/myorg/my-internal-repo-frontend.git#abc123',
			},
		},
	});

	writeFileSync(join(tmpDir, 'package-lock.json'), packageLock);
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	const eslint = createESLint(/** @type {import('eslint').Linter.FlatConfig} */ ({
		files: ['**/*.js'],
		plugins: { lockfile: plugin },
		rules: {
			'lockfile/non-registry-specifiers': ['error', {
				ignore: [
					{ specifier: 'my-internal-repo', explanation: 'Our internal monorepo' },
				],
			}],
		},
	}), tmpDir);

	const results = await eslint.lintFiles(['index.js']);
	t.equal(results[0].errorCount, 0, 'no errors - substring match works in ignore list');

	t.end();
});

test('non-registry-specifiers - ignore with substring match in virtual lockfile (line 250)', async (t) => {
	// This tests the .includes() branch in the virtual lockfile path
	// Using esmock to return a git URL where the specifier is a substring
	const nonRegistryRule = await esmock('eslint-plugin-lockfile/rules/non-registry-specifiers.mjs', {
		'lockfile-tools/virtual': {
			hasLockfile: () => false,
			buildVirtualLockfile: async () => [
				{
					name: 'my-internal-package',
					version: '1.0.0',
					resolved: 'git+https://github.com/mycompany/my-internal-monorepo-packages.git#main',
					integrity: null,
					isDirect: true,
				},
			],
		},
	});

	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: {
			'my-internal-package': 'github:mycompany/my-internal-monorepo-packages',
		},
	}));
	const testFile = join(tmpDir, 'index.js');
	writeFileSync(testFile, 'const x = 1;');

	/** @type {{ messageId?: string; data?: Record<string, unknown> }[]} */
	const reports = [];
	const context = /** @type {import('eslint').Rule.RuleContext} */ (/** @type {unknown} */ ({
		filename: testFile,
		options: [{
			ignore: [{
				// Using substring 'my-internal-monorepo' which is part of the full URL
				specifier: 'my-internal-monorepo',
				explanation: 'Our internal monorepo packages',
			}],
		}],
		/** @param {{ messageId?: string; data?: Record<string, unknown> }} info */
		report(info) {
			reports.push(info);
		},
	}));

	const ruleInstance = nonRegistryRule.default.create(context);
	// eslint-disable-next-line new-cap
	await ruleInstance.Program(/** @type {import('estree').Program} */ (/** @type {unknown} */ ({ type: 'Program' })));

	t.equal(reports.length, 0, 'no errors - substring match works in virtual lockfile');

	t.end();
});

test('non-registry-specifiers - virtual lockfile with HTTP registry (lines 259-268)', async (t) => {
	// Tests the non-HTTPS registry detection in virtual lockfile path
	const nonRegistryRule = await esmock('eslint-plugin-lockfile/rules/non-registry-specifiers.mjs', {
		'lockfile-tools/virtual': {
			hasLockfile: () => false,
			buildVirtualLockfile: async () => [
				{
					name: 'some-package',
					version: '1.0.0',
					resolved: 'http://registry.npmjs.org/some-package/-/some-package-1.0.0.tgz',
					integrity: 'sha512-xxx',
					isDirect: true,
				},
			],
		},
	});

	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: {
			'some-package': '^1.0.0',
		},
	}));
	const testFile = join(tmpDir, 'index.js');
	writeFileSync(testFile, 'const x = 1;');

	/** @type {{ messageId?: string; data?: Record<string, unknown> }[]} */
	const reports = [];
	const context = /** @type {import('eslint').Rule.RuleContext} */ (/** @type {unknown} */ ({
		filename: testFile,
		options: [],
		/** @param {{ messageId?: string; data?: Record<string, unknown> }} info */
		report(info) {
			reports.push(info);
		},
	}));

	const ruleInstance = nonRegistryRule.default.create(context);
	// eslint-disable-next-line new-cap
	await ruleInstance.Program(/** @type {import('estree').Program} */ (/** @type {unknown} */ ({ type: 'Program' })));

	t.equal(reports.length, 1, 'error reported for HTTP registry in virtual lockfile');
	t.equal(reports[0].messageId, 'nonHttpsRegistry', 'correct message ID');
	t.ok(String(reports[0].data?.filename).includes('virtual'), 'error mentions virtual lockfile');

	t.end();
});

test('non-registry-specifiers - virtual lockfile with non-registry specifier (lines 278-279)', async (t) => {
	// Tests non-registry specifier detection in virtual lockfile without ignore match
	const nonRegistryRule = await esmock('eslint-plugin-lockfile/rules/non-registry-specifiers.mjs', {
		'lockfile-tools/virtual': {
			hasLockfile: () => false,
			buildVirtualLockfile: async () => [
				{
					name: 'github-package',
					version: '1.0.0',
					resolved: 'git+https://github.com/user/repo.git#abc123',
					integrity: null,
					isDirect: true,
				},
			],
		},
	});

	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: {
			'github-package': 'github:user/repo',
		},
	}));
	const testFile = join(tmpDir, 'index.js');
	writeFileSync(testFile, 'const x = 1;');

	/** @type {{ messageId?: string; data?: Record<string, unknown> }[]} */
	const reports = [];
	const context = /** @type {import('eslint').Rule.RuleContext} */ (/** @type {unknown} */ ({
		filename: testFile,
		options: [],
		/** @param {{ messageId?: string; data?: Record<string, unknown> }} info */
		report(info) {
			reports.push(info);
		},
	}));

	const ruleInstance = nonRegistryRule.default.create(context);
	// eslint-disable-next-line new-cap
	await ruleInstance.Program(/** @type {import('estree').Program} */ (/** @type {unknown} */ ({ type: 'Program' })));

	t.equal(reports.length, 1, 'error reported for non-registry specifier in virtual lockfile');
	t.equal(reports[0].messageId, 'nonRegistrySpecifier', 'correct message ID');
	t.ok(String(reports[0].data?.filename).includes('virtual'), 'error mentions virtual lockfile');

	t.end();
});

test('non-registry-specifiers - virtual lockfile with package without resolved (line 249)', async (t) => {
	// Tests early return when package has no resolved URL in virtual lockfile
	const nonRegistryRule = await esmock('eslint-plugin-lockfile/rules/non-registry-specifiers.mjs', {
		'lockfile-tools/virtual': {
			hasLockfile: () => false,
			buildVirtualLockfile: async () => [
				{
					name: 'local-package',
					version: '1.0.0',
					resolved: null, // No resolved URL
					integrity: null,
					isDirect: true,
				},
			],
		},
	});

	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: {
			'local-package': 'file:../local-package',
		},
	}));
	const testFile = join(tmpDir, 'index.js');
	writeFileSync(testFile, 'const x = 1;');

	/** @type {{ messageId?: string; data?: Record<string, unknown> }[]} */
	const reports = [];
	const context = /** @type {import('eslint').Rule.RuleContext} */ (/** @type {unknown} */ ({
		filename: testFile,
		options: [],
		/** @param {{ messageId?: string; data?: Record<string, unknown> }} info */
		report(info) {
			reports.push(info);
		},
	}));

	const ruleInstance = nonRegistryRule.default.create(context);
	// eslint-disable-next-line new-cap
	await ruleInstance.Program(/** @type {import('estree').Program} */ (/** @type {unknown} */ ({ type: 'Program' })));

	t.equal(reports.length, 0, 'no errors when package has no resolved URL');

	t.end();
});
