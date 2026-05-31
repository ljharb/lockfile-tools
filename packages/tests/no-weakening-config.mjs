import test from 'tape';
import {
	mkdtempSync, mkdirSync, writeFileSync, rmSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createESLint, eslintMajorVersion } from './helpers/eslint-compat.mjs';
import plugin from 'eslint-plugin-lockfile';

const skipOnV8 = eslintMajorVersion < 9
	? { skip: 'requires flat-config languageOptions.parser; not applicable to ESLint 8 legacy config' }
	: {};

/**
 * Builds a temp project (with a `.git` marker by default so the config walk
 * stops there), writes `files`, lints `index.js` in `dir`, and returns the
 * resulting message ids.
 * @param {{ files?: Record<string, string>, git?: boolean, dir?: string }} [opts]
 * @returns {Promise<(string | undefined)[]>}
 */
async function run(opts) {
	const {
		files = {}, git = true, dir: subdir = '.',
	} = opts || {};
	const root = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-nwc-'));
	try {
		if (git) {
			mkdirSync(join(root, '.git'));
		}
		const dir = subdir === '.' ? root : join(root, subdir);
		if (dir !== root) {
			mkdirSync(dir, { recursive: true });
		}
		writeFileSync(join(dir, 'index.js'), 'const x = 1;\n');
		Object.keys(files).forEach((rel) => {
			writeFileSync(join(root, rel), files[rel]);
		});
		const eslint = createESLint({
			plugins: { lockfile: plugin },
			rules: { 'lockfile/no-weakening-config': 'error' },
		}, dir);
		const results = await eslint.lintFiles([join(dir, 'index.js')]);
		return results[0].messages.map((m) => m.messageId);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

test('no-weakening-config - no config files is fine', async (t) => {
	t.deepEqual(await run(), [], 'nothing to flag');
	t.end();
});

test('no-weakening-config - .npmrc strict-ssl=false is flagged', async (t) => {
	t.deepEqual(await run({ files: { '.npmrc': 'strict-ssl=false\n' } }), ['npmStrictSsl']);
	t.end();
});

test('no-weakening-config - .npmrc verify-store-integrity=false is flagged', async (t) => {
	t.deepEqual(await run({ files: { '.npmrc': 'verify-store-integrity=false\n' } }), ['npmVerifyStoreIntegrity']);
	t.end();
});

test('no-weakening-config - .npmrc dangerously-allow-all-builds=true is flagged', async (t) => {
	t.deepEqual(await run({ files: { '.npmrc': 'dangerously-allow-all-builds=true\n' } }), ['npmDangerousBuilds']);
	t.end();
});

test('no-weakening-config - safe .npmrc values are not flagged', async (t) => {
	const npmrc = [
		'# a comment',
		'; another',
		'junk-without-equals',
		'',
		'strict-ssl=true',
		'verify-store-integrity=true',
		'dangerously-allow-all-builds=false',
	].join('\n');
	t.deepEqual(await run({ files: { '.npmrc': npmrc } }), [], 'safe values, comments and junk are ignored');
	t.end();
});

test('no-weakening-config - last definition in .npmrc wins', async (t) => {
	const npmrc = 'strict-ssl=true\nstrict-ssl=false\n';
	t.deepEqual(await run({ files: { '.npmrc': npmrc } }), ['npmStrictSsl'], 'later strict-ssl=false wins');
	t.end();
});

test('no-weakening-config - multiple weakening .npmrc settings each report', async (t) => {
	const npmrc = 'strict-ssl=false\nverify-store-integrity=false\ndangerously-allow-all-builds=true\n';
	const ids = (await run({ files: { '.npmrc': npmrc } })).sort();
	t.deepEqual(ids, ['npmDangerousBuilds', 'npmStrictSsl', 'npmVerifyStoreIntegrity'], 'all three report');
	t.end();
});

test('no-weakening-config - .yarnrc.yml checksumBehavior: ignore is flagged', async (t) => {
	t.deepEqual(await run({ files: { '.yarnrc.yml': 'checksumBehavior: ignore\n' } }), ['yarnChecksumBehavior']);
	t.end();
});

test('no-weakening-config - .yarnrc.yml enableStrictSsl: false is flagged', async (t) => {
	t.deepEqual(await run({ files: { '.yarnrc.yml': 'nodeLinker: node-modules\nenableStrictSsl: false\n' } }), ['yarnStrictSsl']);
	t.end();
});

test('no-weakening-config - a safe .yarnrc.yml is not flagged', async (t) => {
	t.deepEqual(
		await run({ files: { '.yarnrc.yml': 'checksumBehavior: throw\nenableStrictSsl: true\n' } }),
		[],
		'non-weakening yarn settings are fine',
	);
	t.end();
});

test('no-weakening-config - walks up to a parent .npmrc', async (t) => {
	const ids = await run({ dir: 'packages/pkg', files: { '.npmrc': 'strict-ssl=false\n' } });
	t.deepEqual(ids, ['npmStrictSsl'], 'a parent .npmrc applies to the nested package');
	t.end();
});

test('no-weakening-config - with no .git marker the walk reaches the filesystem root', async (t) => {
	t.deepEqual(await run({ git: false, files: { '.npmrc': 'strict-ssl=false\n' } }), ['npmStrictSsl']);
	t.end();
});

test('no-weakening-config - recommended config fires on package.json', skipOnV8, async (t) => {
	const dir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-nwc-rec-'));
	try {
		mkdirSync(join(dir, '.git'));
		writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'app', private: true }));
		writeFileSync(join(dir, '.npmrc'), 'strict-ssl=false\n');
		const eslint = createESLint(
			plugin.configs.recommended.map((block) => ({ ...block, plugins: { lockfile: plugin } })),
			dir,
		);
		const results = await eslint.lintFiles(['package.json']);
		const { messages } = results[0];
		t.ok(
			messages.some((m) => m.ruleId === 'lockfile/no-weakening-config' && m.messageId === 'npmStrictSsl'),
			'the rule fires via recommended on package.json',
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
	t.end();
});
