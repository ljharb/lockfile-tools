import test from 'tape';
import {
	mkdtempSync, mkdirSync, writeFileSync, rmSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createESLint, eslintMajorVersion } from './helpers/eslint-compat.mjs';
import plugin from 'eslint-plugin-lockfile';

// ESLint 8 (eslintrc) reads `package.json` during config resolution, so a
// deliberately-malformed `package.json` fixture crashes the lint before the
// rule runs. Flat config (eslint >= 9) doesn't read `package.json` for config.
const skipMalformedOnV8 = eslintMajorVersion < 9
	? { skip: 'ESLint 8 reads package.json for config and chokes on malformed JSON' }
	: {};

const skipOnV8 = eslintMajorVersion < 9
	? { skip: 'requires flat-config languageOptions.parser; not applicable to ESLint 8 legacy config' }
	: {};

/**
 * Sets up a temp project directory. By default it contains a `.git` marker so
 * the rule's `.gitignore`/`.npmrc` walk stops there (deterministic), plus a
 * `package.json` and an `index.js` to lint.
 * @param {{ files?: Record<string, string>, git?: boolean, pkg?: object | string, dir?: string }} [opts]
 * @returns {{ root: string, dir: string }}
 */
function setup(opts) {
	const {
		files = {},
		git = true,
		pkg = { name: 'test' },
		dir: subdir = '.',
	} = opts || {};
	const root = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-tracked-'));
	if (git) {
		mkdirSync(join(root, '.git'));
	}
	const dir = subdir === '.' ? root : join(root, subdir);
	if (dir !== root) {
		mkdirSync(dir, { recursive: true });
	}
	if (pkg !== null) {
		writeFileSync(join(dir, 'package.json'), typeof pkg === 'string' ? pkg : JSON.stringify(pkg));
	}
	writeFileSync(join(dir, 'index.js'), 'const x = 1;\n');
	Object.keys(files).forEach((rel) => {
		const target = join(root, rel);
		writeFileSync(target, files[rel]);
	});
	return { root, dir };
}

/**
 * @param {string} cwd
 * @param {import('eslint').Linter.RuleEntry} ruleOption
 * @param {string} lintFile
 * @returns {Promise<import('eslint').Linter.LintMessage[]>}
 */
async function lint(cwd, ruleOption, lintFile) {
	const eslint = createESLint({
		files: ['**/*.js'],
		plugins: { lockfile: plugin },
		rules: { 'lockfile/tracked': ruleOption },
	}, cwd);
	const results = await eslint.lintFiles([lintFile]);
	return results[0].messages;
}

test('tracked - lockfile present and tracked (no .gitignore) is fine', async (t) => {
	const { root } = setup({ files: { 'package-lock.json': '{}' } });
	try {
		const messages = await lint(root, ['error', 'npm'], 'index.js');
		t.deepEqual(messages, [], 'no errors when lockfile is present and not ignored');
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
	t.end();
});

test('tracked - lockfile present, .gitignore present but does not match it, is fine', async (t) => {
	const { root } = setup({ files: { 'package-lock.json': '{}', '.gitignore': 'node_modules\n' } });
	try {
		const messages = await lint(root, ['error', 'npm'], 'index.js');
		t.deepEqual(messages, [], 'no errors when lockfile is not matched by .gitignore');
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
	t.end();
});

test('tracked - lockfile present but gitignored, app (private) suggests committing', async (t) => {
	const { root } = setup({
		pkg: { name: 'app', private: true },
		files: { 'package-lock.json': '{}', '.gitignore': 'package-lock.json\n' },
	});
	try {
		const messages = await lint(root, ['error', 'npm'], 'index.js');
		t.equal(messages.length, 1, 'one error');
		t.equal(messages[0].messageId, 'untrackedApp', 'app variant');
		t.ok((/commit/).test(messages[0].message), 'leads with committing');
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
	t.end();
});

test('tracked - lockfile present but gitignored, published package suggests disabling', async (t) => {
	const { root } = setup({
		pkg: { name: 'lib' },
		files: { 'package-lock.json': '{}', '.gitignore': 'package-lock.json\n' },
	});
	try {
		const messages = await lint(root, ['error', 'npm'], 'index.js');
		t.equal(messages.length, 1, 'one error');
		t.equal(messages[0].messageId, 'untrackedPublished', 'published variant');
		t.ok((/package-lock=false/).test(messages[0].message), 'mentions disable config');
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
	t.end();
});

test('tracked - yarn.lock present but gitignored: must be tracked (no disable option)', async (t) => {
	const { root } = setup({ files: { 'yarn.lock': '# yarn\n', '.gitignore': 'yarn.lock\n' } });
	try {
		const messages = await lint(root, ['error', 'yarn'], 'index.js');
		t.equal(messages.length, 1, 'one error');
		t.equal(messages[0].messageId, 'untrackedNoDisable', 'no-disable variant');
		t.ok((/no option to disable/).test(messages[0].message), 'explains yarn cannot disable');
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
	t.end();
});

test('tracked - no lockfile and no disable config: app', async (t) => {
	const { root } = setup({ pkg: { name: 'app', private: true } });
	try {
		const messages = await lint(root, ['error', 'npm'], 'index.js');
		t.equal(messages.length, 1, 'one error');
		t.equal(messages[0].messageId, 'missingApp', 'app variant');
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
	t.end();
});

test('tracked - no lockfile and no disable config: published (and default option is npm)', async (t) => {
	const { root } = setup({ pkg: { name: 'lib' } });
	try {
		// no explicit option exercises the `|| 'npm'` default
		const messages = await lint(root, 'error', 'index.js');
		t.equal(messages.length, 1, 'one error');
		t.equal(messages[0].messageId, 'missingPublished', 'published variant');
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
	t.end();
});

test('tracked - no lockfile but package-lock=false is set, is fine', async (t) => {
	const { root } = setup({ files: { '.npmrc': 'package-lock=false\n' } });
	try {
		const messages = await lint(root, ['error', 'npm'], 'index.js');
		t.deepEqual(messages, [], 'no errors when npm lockfile is disabled');
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
	t.end();
});

test('tracked - no lockfile, .npmrc sets package-lock to a non-false value, reports', async (t) => {
	const { root } = setup({ files: { '.npmrc': 'package-lock=true\n' } });
	try {
		const messages = await lint(root, ['error', 'npm'], 'index.js');
		t.equal(messages.length, 1, 'one error when value is not false');
		t.equal(messages[0].messageId, 'missingPublished');
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
	t.end();
});

test('tracked - .npmrc with comments, blanks, junk lines, last definition wins', async (t) => {
	const npmrc = [
		'',
		'# a comment',
		'; another comment',
		'junk-without-equals',
		'registry=https://example.com',
		'package-lock=true',
		'package-lock=false',
	].join('\n');
	const { root } = setup({ files: { '.npmrc': npmrc } });
	try {
		const messages = await lint(root, ['error', 'npm'], 'index.js');
		t.deepEqual(messages, [], 'last package-lock=false wins, so no errors');
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
	t.end();
});

test('tracked - yarn with no lockfile reports nothing (cannot be disabled, cannot be required)', async (t) => {
	const { root } = setup();
	try {
		const messages = await lint(root, ['error', 'yarn'], 'index.js');
		t.deepEqual(messages, [], 'no error for absent yarn lockfile');
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
	t.end();
});

test('tracked - pnpm lockfile=false in .npmrc is fine; otherwise reports', async (t) => {
	const ok = setup({ files: { '.npmrc': 'lockfile=false\n' } });
	try {
		const messages = await lint(ok.root, ['error', 'pnpm'], 'index.js');
		t.deepEqual(messages, [], 'no errors when pnpm lockfile is disabled');
	} finally {
		rmSync(ok.root, { recursive: true, force: true });
	}

	const bad = setup({ pkg: { name: 'lib' } });
	try {
		const messages = await lint(bad.root, ['error', 'pnpm'], 'index.js');
		t.equal(messages.length, 1, 'reports when pnpm lockfile missing and not disabled');
		t.ok((/lockfile=false/).test(messages[0].message), 'mentions pnpm disable config');
	} finally {
		rmSync(bad.root, { recursive: true, force: true });
	}
	t.end();
});

test('tracked - bun save=false under [install.lockfile] is fine', async (t) => {
	const bunfig = [
		'# bunfig',
		'[install]',
		'save = false', // wrong section: must NOT count
		'frozen = true',
		'[install.lockfile]',
		'print = "yarn"', // in section, not save
		'save = false', // counts
	].join('\n');
	const { root } = setup({ files: { 'bunfig.toml': bunfig } });
	try {
		const messages = await lint(root, ['error', 'bun'], 'index.js');
		t.deepEqual(messages, [], 'no errors when bun lockfile is disabled');
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
	t.end();
});

test('tracked - bun with save not false reports', async (t) => {
	const { root } = setup({ files: { 'bunfig.toml': '[install.lockfile]\nsave = true\n' } });
	try {
		const messages = await lint(root, ['error', 'bun'], 'index.js');
		t.equal(messages.length, 1, 'reports when bun save is not false');
		t.ok((/install\.lockfile/).test(messages[0].message), 'mentions bunfig config');
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
	t.end();
});

test('tracked - bun with no bunfig reports', async (t) => {
	const { root } = setup();
	try {
		const messages = await lint(root, ['error', 'bun'], 'index.js');
		t.equal(messages.length, 1, 'reports when no bunfig.toml exists');
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
	t.end();
});

test('tracked - array of managers checks each independently', async (t) => {
	const { root } = setup({ pkg: { name: 'lib' } });
	try {
		// npm -> missing (reports); yarn -> nothing
		const messages = await lint(root, ['error', ['npm', 'yarn']], 'index.js');
		t.equal(messages.length, 1, 'only npm reports');
		t.equal(messages[0].messageId, 'missingPublished');
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
	t.end();
});

test('tracked - malformed package.json is treated as published', skipMalformedOnV8, async (t) => {
	const { root } = setup({ pkg: '{ not valid json' });
	try {
		const messages = await lint(root, ['error', 'npm'], 'index.js');
		t.equal(messages.length, 1, 'one error');
		t.equal(messages[0].messageId, 'missingPublished', 'parse failure falls back to published');
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
	t.end();
});

test('tracked - walks up to a parent .gitignore (and stops at the git root)', async (t) => {
	const { root, dir } = setup({
		dir: 'workspaces/pkg',
		pkg: { name: 'lib' },
		files: {
			'.gitignore': 'package-lock.json\n',
			'workspaces/pkg/package-lock.json': '{}',
		},
	});
	try {
		const messages = await lint(dir, ['error', 'npm'], 'index.js');
		t.equal(messages.length, 1, 'parent .gitignore applies to the nested lockfile');
		t.equal(messages[0].messageId, 'untrackedPublished');
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
	t.end();
});

test('tracked - walks up to a parent .npmrc', async (t) => {
	const { root, dir } = setup({
		dir: 'workspaces/pkg',
		files: { '.npmrc': 'package-lock=false\n' },
	});
	try {
		const messages = await lint(dir, ['error', 'npm'], 'index.js');
		t.deepEqual(messages, [], 'parent .npmrc package-lock=false applies to nested package');
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
	t.end();
});

test('tracked - with no .git marker, the walk terminates at the filesystem root', async (t) => {
	const { root } = setup({ git: false, pkg: { name: 'lib' } });
	try {
		const messages = await lint(root, ['error', 'npm'], 'index.js');
		t.equal(messages.length, 1, 'still reports; walk reaches filesystem root without error');
		t.equal(messages[0].messageId, 'missingPublished');
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
	t.end();
});

test('tracked - recommended config fires the rule on package.json', skipOnV8, async (t) => {
	const { root } = setup({ pkg: { name: 'lib' } });
	try {
		const eslint = createESLint(
			plugin.configs.recommended.map((block) => ({ ...block, plugins: { lockfile: plugin } })),
			root,
		);
		const results = await eslint.lintFiles(['package.json']);
		const fatal = results.flatMap((r) => r.messages).filter((m) => m.fatal);
		t.deepEqual(fatal, [], 'no fatal/parsing errors on package.json');
		t.equal(results[0].messages.length, 1, 'rule fires on package.json via recommended');
		t.equal(results[0].messages[0].messageId, 'missingPublished');
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
	t.end();
});

