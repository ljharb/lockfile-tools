import test from 'tape';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createESLint } from './helpers/eslint-compat.mjs';
import plugin from 'eslint-plugin-lockfile';

test('flavor rule - npm allowed by default', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		// Create package.json
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));

		// Create package-lock.json (npm default lockfile)
		writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3 }));

		// Create a test file
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/flavor': ['error', 'npm'],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors with npm lockfile when npm is allowed');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('flavor rule - disallowed lockfile reports error', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'yarn.lock'), '# yarn lockfile v1\n');
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/flavor': ['error', 'npm'],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 1, 'error reported for yarn.lock when only npm is allowed');
		t.ok(results[0].messages[0].message.includes('yarn.lock'), 'error message mentions yarn.lock');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('flavor rule - multiple package managers allowed', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'yarn.lock'), '# yarn lockfile v1\n');
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/flavor': ['error', ['npm', 'yarn']],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors when yarn is in allowed list');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('flavor rule - object configuration with all files', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'npm-shrinkwrap.json'), JSON.stringify({ lockfileVersion: 3 }));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/flavor': ['error', [{ name: 'npm', files: true }]],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors when npm-shrinkwrap.json is allowed via files: true');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('flavor rule - object configuration with specific files', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3 }));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/flavor': ['error', [{ name: 'npm', files: ['package-lock.json'] }]],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors when specific file is allowed');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}

	t.end();
});

test('flavor rule - object configuration with invalid files', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'yarn.lock'), '# yarn lockfile');
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				// Specify invalid files for npm, then add another item to trigger the early return
				'lockfile/flavor': ['error', [{ name: 'npm', files: ['yarn.lock'] }, 'yarn']],
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		// Since the config is invalid (yarn.lock is not a valid npm lockfile),
		// the rule returns {} and doesn't run, so no errors
		t.equal(results[0].errorCount, 0, 'no errors when invalid files specified');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}
	t.end();
});

test('flavor rule - no config defaults to npm', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));

	try {
		writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: {} }));
		writeFileSync(join(tmpDir, 'index.js'), 'const x = 1;');

		const eslint = createESLint({
			files: ['**/*.js'],
			plugins: { lockfile: plugin },
			rules: {
				'lockfile/flavor': 'error', // No config - should default to 'npm'
			},
		}, tmpDir);

		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].errorCount, 0, 'no errors with npm lockfile when defaulting to npm');
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}
	t.end();
});

test('flavor rule - context.getFilename() fallback when context.filename is undefined', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
	writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3 }));

	const testFile = join(tmpDir, 'index.js');
	writeFileSync(testFile, 'var x = 1;');

	const reports = [];
	const context = {
		filename: undefined,
		getFilename() { return testFile; },
		options: [],
		report(/** @type {object} */ info) { reports.push(info); },
	};
	// @ts-expect-error mock context
	const ruleInstance = plugin.rules.flavor.create(context);
	// @ts-expect-error mock node
	// eslint-disable-next-line new-cap
	ruleInstance.Program(/** @type {*} */ ({ type: 'Program' }));

	t.equal(reports.length, 0, 'no errors when using getFilename() fallback');
	t.end();
});
