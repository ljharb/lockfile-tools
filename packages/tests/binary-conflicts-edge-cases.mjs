import test from 'tape';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import esmock from 'esmock';

test('binary-conflicts rule - package with string bin (line 56-58)', async (t) => {
	// Tests the case where bin is a string instead of an object
	// Lines 56-58: return { [packageName]: manifest.bin }
	const binaryModule = await esmock('eslint-plugin-lockfile/rules/binary-conflicts.mjs', {
		'./fixtures/packuments/loader.mjs': {
			createMockPacote: () => ({
				// @ts-expect-error - Test mock
				async manifest(spec) {
					if (spec === 'single-bin@1.0.0') {
						return {
							name: 'single-bin',
							version: '1.0.0',
							bin: './cli.js', // String bin, not object
						};
					}
					throw new Error('Package not found');
				},
			}),
		},
		pacote: {
			// @ts-expect-error - Test mock
			async manifest(spec) {
				if (spec === 'single-bin@1.0.0') {
					return {
						name: 'single-bin',
						version: '1.0.0',
						bin: './cli.js', // String bin
					};
				}
				throw new Error('Package not found');
			},
		},
	});

	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: { 'single-bin': '^1.0.0' },
	}));

	const lockfile = {
		lockfileVersion: 3,
		packages: {
			'node_modules/single-bin': {
				version: '1.0.0',
				resolved: 'https://registry.npmjs.org/single-bin/-/single-bin-1.0.0.tgz',
			},
		},
	};

	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify(lockfile));
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	/** @type {{ messageId?: string; data?: Record<string, unknown> }[]} */
	const reports = [];
	const context = {
		filename: join(tmpDir, 'index.js'),
		options: [],
		/** @param {{ messageId?: string; data?: Record<string, unknown> }} info */
		report(info) {
			reports.push(info);
		},
	};

	const ruleInstance = binaryModule.default.create(context);
	// eslint-disable-next-line new-cap
	await ruleInstance.Program({ type: 'Program' });

	t.equal(reports.length, 0, 'no errors for package with string bin');
	t.end();
});

test('binary-conflicts rule - package with non-object, non-string bin (lines 63-64)', async (t) => {
	// Tests the case where bin is neither string nor object (e.g., number, null, etc.)
	// Lines 63-64: return null for invalid bin type
	const binaryModule = await esmock('eslint-plugin-lockfile/rules/binary-conflicts.mjs', {
		pacote: {
			// @ts-expect-error - Test mock
			async manifest(spec) {
				if (spec === 'invalid-bin@1.0.0') {
					return {
						name: 'invalid-bin',
						version: '1.0.0',
						bin: 123, // Invalid bin type
					};
				}
				throw new Error('Package not found');
			},
		},
	});

	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: { 'invalid-bin': '^1.0.0' },
	}));

	const lockfile = {
		lockfileVersion: 3,
		packages: {
			'node_modules/invalid-bin': {
				version: '1.0.0',
				resolved: 'https://registry.npmjs.org/invalid-bin/-/invalid-bin-1.0.0.tgz',
			},
		},
	};

	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify(lockfile));
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	/** @type {{ messageId?: string; data?: Record<string, unknown> }[]} */
	const reports = [];
	const context = {
		filename: join(tmpDir, 'index.js'),
		options: [],
		/** @param {{ messageId?: string; data?: Record<string, unknown> }} info */
		report(info) {
			reports.push(info);
		},
	};

	const ruleInstance = binaryModule.default.create(context);
	// eslint-disable-next-line new-cap
	await ruleInstance.Program({ type: 'Program' });

	t.equal(reports.length, 0, 'no errors for package with invalid bin type');
	t.end();
});

test('binary-conflicts rule - package without bins returns null (line 190)', async (t) => {
	// Tests the case where extractBinsFromPackument returns null
	// Line 190: return null when no bins found
	const binaryModule = await esmock('eslint-plugin-lockfile/rules/binary-conflicts.mjs', {
		pacote: {
			// @ts-expect-error - Test mock
			async manifest(spec) {
				if (spec === 'no-bins@1.0.0') {
					return {
						name: 'no-bins',
						version: '1.0.0',
						// No bin field
					};
				}
				throw new Error('Package not found');
			},
		},
	});

	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: { 'no-bins': '^1.0.0' },
	}));

	const lockfile = {
		lockfileVersion: 3,
		packages: {
			'node_modules/no-bins': {
				version: '1.0.0',
				resolved: 'https://registry.npmjs.org/no-bins/-/no-bins-1.0.0.tgz',
			},
		},
	};

	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify(lockfile));
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	/** @type {{ messageId?: string; data?: Record<string, unknown> }[]} */
	const reports = [];
	const context = {
		filename: join(tmpDir, 'index.js'),
		options: [],
		/** @param {{ messageId?: string; data?: Record<string, unknown> }} info */
		report(info) {
			reports.push(info);
		},
	};

	const ruleInstance = binaryModule.default.create(context);
	// eslint-disable-next-line new-cap
	await ruleInstance.Program({ type: 'Program' });

	t.equal(reports.length, 0, 'no errors when package has no bins');
	t.end();
});

test('binary-conflicts rule - bun.lockb with no content (line 281)', async (t) => {
	// Tests the case where loadBunLockbContent returns null
	// Line 281: return extractPackageBinsFromYarnLockfile when content exists
	// We need to test the path where yarnLockContent is null
	const binaryModule = await esmock('eslint-plugin-lockfile/rules/binary-conflicts.mjs', {
		'lockfile-tools/io': {
			loadBunLockbContent: () => null, // Simulates failed bun.lockb load
		},
	});

	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	// Create an empty bun.lockb file
	writeFileSync(join(tmpDir, 'bun.lockb'), '');
	writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

	/** @type {{ messageId?: string; data?: Record<string, unknown> }[]} */
	const reports = [];
	const context = {
		filename: join(tmpDir, 'index.js'),
		options: [],
		/** @param {{ messageId?: string; data?: Record<string, unknown> }} info */
		report(info) {
			reports.push(info);
		},
	};

	const ruleInstance = binaryModule.default.create(context);
	// eslint-disable-next-line new-cap
	await ruleInstance.Program({ type: 'Program' });

	t.equal(reports.length, 0, 'no errors when bun.lockb cannot be loaded');
	t.end();
});
