import test from 'tape';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import esmock from 'esmock';
import { createMockPacote } from './fixtures/packuments/loader.mjs';

const mockedPacote = createMockPacote([
	'gulp@4.0.2',
	'gulp-cli@2.3.0',
]);

const binaryConflictsRule = await esmock('eslint-plugin-lockfile/rules/binary-conflicts.mjs', {}, {
	pacote: mockedPacote,
});

test('binary-conflicts rule - detects devDependencies as direct dependencies', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	// gulp-cli is in devDependencies, gulp is transitive
	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		devDependencies: {
			'gulp-cli': '^2.0.0',
		},
	}));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 3,
		packages: {
			'': {
				name: 'test',
				devDependencies: {
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
	t.ok(reports.some((r) => r.messageId === 'binaryConflictWithPreference'), 'reports conflict with preference');
	t.ok(reports.some((r) => (/** @type {string | undefined} */ (r.data?.active))?.includes('gulp-cli@2.3.0')), 'gulp-cli from devDependencies is active');
	t.end();
});

test('binary-conflicts rule - handles package.json without devDependencies', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: {
			gulp: '^4.0.0',
		},
		// No devDependencies field
	}));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 3,
		packages: {
			'': {
				name: 'test',
				dependencies: {
					gulp: '^4.0.0',
				},
			},
			'node_modules/gulp': {
				version: '4.0.2',
				resolved: 'https://registry.npmjs.org/gulp/-/gulp-4.0.2.tgz',
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

	t.equal(reports.length, 0, 'no errors when package.json has no devDependencies');
	t.end();
});

test('binary-conflicts rule - handles malformed package.json', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	// Malformed JSON
	writeFileSync(join(tmpDir, 'package.json'), '{invalid json');
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({
		lockfileVersion: 3,
		packages: {
			'': {
				name: 'test',
			},
			'node_modules/gulp': {
				version: '4.0.2',
				resolved: 'https://registry.npmjs.org/gulp/-/gulp-4.0.2.tgz',
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

	t.equal(reports.length, 0, 'no crash when package.json is malformed');
	t.end();
});
