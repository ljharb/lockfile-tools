import test from 'tape';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import esmock from 'esmock';

// Mock virtual lockfile to return packages with conflicting bins
const mockVirtualLockfile = {
	hasLockfile: () => false,
	buildVirtualLockfile: async () => [
		{
			name: 'gulp',
			version: '4.0.2',
			resolved: 'https://registry.npmjs.org/gulp/-/gulp-4.0.2.tgz',
			integrity: 'sha512-test',
			isDirect: true,
		},
		{
			name: 'gulp-cli',
			version: '2.3.0',
			resolved: 'https://registry.npmjs.org/gulp-cli/-/gulp-cli-2.3.0.tgz',
			integrity: 'sha512-test',
			isDirect: false,
		},
	],
};

// Mock pacote to return bin information
const mockPacote = {
	/** @param {string} spec */
	async manifest(spec) {
		if (spec.includes('gulp@4.0.2') || spec.includes('/gulp@4.0.2')) {
			return {
				name: 'gulp',
				version: '4.0.2',
				bin: { gulp: 'bin/gulp.js' },
			};
		}
		if (spec.includes('gulp-cli@2.3.0') || spec.includes('/gulp-cli@2.3.0')) {
			return {
				name: 'gulp-cli',
				version: '2.3.0',
				bin: { gulp: 'bin/gulp.js' },
			};
		}
		const err = /** @type {Error & { code?: string }} */ (new Error(`404 Not Found - ${spec}`));
		err.code = 'E404';
		throw err;
	},
};

const binaryConflictsRule = await esmock('eslint-plugin-lockfile/rules/binary-conflicts.mjs', {
	'lockfile-tools/virtual': mockVirtualLockfile,
}, {
	pacote: mockPacote,
});

test('binary-conflicts rule - virtual lockfile with conflicting bins', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: {
			gulp: '^4.0.0',
			'gulp-cli': '^2.0.0',
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

	t.ok(reports.length > 0, 'error reported for binary conflict in virtual lockfile');
	t.ok(reports.some((r) => r.messageId === 'binaryConflictWithPreference'), 'reports conflict with preference');
	t.ok(reports.some((r) => r.data?.binary === 'gulp'), 'error mentions gulp binary');
	t.ok(reports.some((r) => String(r.data?.active).includes('gulp@4.0.2')), 'gulp is active (direct dependency)');
	t.end();
});

test('binary-conflicts rule - virtual lockfile with multiple direct dependencies', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	const mockVirtualMultipleDirect = {
		hasLockfile: () => false,
		buildVirtualLockfile: async () => [
			{
				name: 'gulp',
				version: '4.0.2',
				resolved: 'https://registry.npmjs.org/gulp/-/gulp-4.0.2.tgz',
				integrity: 'sha512-test',
				isDirect: true,
			},
			{
				name: 'gulp-cli',
				version: '2.3.0',
				resolved: 'https://registry.npmjs.org/gulp-cli/-/gulp-cli-2.3.0.tgz',
				integrity: 'sha512-test',
				isDirect: true,
			},
		],
	};

	const rule = await esmock('eslint-plugin-lockfile/rules/binary-conflicts.mjs', {
		'lockfile-tools/virtual': mockVirtualMultipleDirect,
	}, {
		pacote: mockPacote,
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: {
			gulp: '^4.0.0',
			'gulp-cli': '^2.0.0',
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

	const ruleInstance = rule.create(context);
	// eslint-disable-next-line new-cap
	await ruleInstance.Program({ type: 'Program' });

	t.ok(reports.length > 0, 'error reported for binary conflict');
	t.ok(reports.some((r) => r.messageId === 'binaryConflict'), 'reports generic conflict (no clear preference)');
	t.ok(reports.some((r) => r.data?.binary === 'gulp'), 'error mentions gulp binary');
	t.end();
});

test('binary-conflicts rule - virtual lockfile with package missing bins', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	const mockVirtualNoBins = {
		hasLockfile: () => false,
		buildVirtualLockfile: async () => [
			{
				name: 'some-package',
				version: '1.0.0',
				resolved: 'https://registry.npmjs.org/some-package/-/some-package-1.0.0.tgz',
				integrity: 'sha512-test',
				isDirect: true,
			},
		],
	};

	const mockPacoteNoBins = {
		async manifest() {
			return {
				name: 'some-package',
				version: '1.0.0',
				// No bin field
			};
		},
	};

	const rule = await esmock('eslint-plugin-lockfile/rules/binary-conflicts.mjs', {
		'lockfile-tools/virtual': mockVirtualNoBins,
	}, {
		pacote: mockPacoteNoBins,
	});

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
	const context = {
		filename: testFile,
		/** @param {{messageId?: string; data?: Record<string, unknown> }} info */
		report(info) {
			reports.push(info);
		},
	};

	const ruleInstance = rule.create(context);
	// eslint-disable-next-line new-cap
	await ruleInstance.Program({ type: 'Program' });

	t.equal(reports.length, 0, 'no errors when package has no bins');
	t.end();
});
