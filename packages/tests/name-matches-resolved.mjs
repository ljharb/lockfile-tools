import test from 'tape';
import {
	mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import esmock from 'esmock';
import { createESLint, eslintMajorVersion } from './helpers/eslint-compat.mjs';
import plugin from 'eslint-plugin-lockfile';

const skipOnV8 = eslintMajorVersion < 9
	? { skip: 'requires flat-config languageOptions.parser; not applicable to ESLint 8 legacy config' }
	: {};

/**
 * Writes `files` into a fresh temp dir (plus an `index.js` to lint and a
 * `package.json`), runs the rule against the directory via the real ESLint
 * pipeline, and returns the lint messages.
 * @param {Record<string, string>} files
 * @returns {Promise<import('eslint').Linter.LintMessage[]>}
 */
async function run(files) {
	const dir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-nmr-'));
	try {
		writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(dir, 'index.js'), 'const x = 1;\n');
		Object.keys(files).forEach((name) => {
			writeFileSync(join(dir, name), files[name]);
		});
		const eslint = createESLint({
			plugins: { lockfile: plugin },
			rules: { 'lockfile/name-matches-resolved': 'error' },
		}, dir);
		const results = await eslint.lintFiles(['index.js']);
		return results[0].messages;
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

/** @type {(name: string, version: string) => string} */
function tgz(name, version) {
	return `https://registry.npmjs.org/${name}/-/${name.split('/').pop()}-${version}.tgz`;
}

test('name-matches-resolved - npm v3 matching resolved is fine', async (t) => {
	const messages = await run({
		'package-lock.json': JSON.stringify({
			lockfileVersion: 3,
			packages: {
				'': { name: 'root' },
				'node_modules/lodash': { version: '4.17.21', resolved: tgz('lodash', '4.17.21') },
				'node_modules/@babel/core': { version: '7.0.0', resolved: tgz('@babel/core', '7.0.0') },
			},
		}),
	});
	t.deepEqual(messages, [], 'no errors when names match (incl. scoped)');
	t.end();
});

test('name-matches-resolved - npm v3 mismatch is reported', async (t) => {
	const messages = await run({
		'package-lock.json': JSON.stringify({
			lockfileVersion: 3,
			packages: {
				'': { name: 'root' },
				'node_modules/lodash': { version: '4.17.21', resolved: tgz('totally-evil', '4.17.21') },
			},
		}),
	});
	t.equal(messages.length, 1, 'one error');
	t.equal(messages[0].messageId, 'mismatch');
	t.ok((/`lodash`/).test(messages[0].message), 'names the lockfile key');
	t.ok((/`totally-evil`/).test(messages[0].message), 'names the URL package');
	t.end();
});

test('name-matches-resolved - npm v3 scoped mismatch is reported', async (t) => {
	const messages = await run({
		'package-lock.json': JSON.stringify({
			lockfileVersion: 3,
			packages: {
				'': { name: 'root' },
				'node_modules/@babel/core': { version: '7.0.0', resolved: tgz('@evil/core', '7.0.0') },
			},
		}),
	});
	t.equal(messages.length, 1, 'one error');
	t.ok((/`@babel\/core`/).test(messages[0].message), 'names the scoped key');
	t.ok((/`@evil\/core`/).test(messages[0].message), 'names the scoped URL package');
	t.end();
});

test('name-matches-resolved - npm v3 nested node_modules uses the leaf name', async (t) => {
	const messages = await run({
		'package-lock.json': JSON.stringify({
			lockfileVersion: 3,
			packages: {
				'': { name: 'root' },
				'node_modules/a/node_modules/b': { version: '1.0.0', resolved: tgz('b', '1.0.0') },
				'node_modules/a/node_modules/c': { version: '1.0.0', resolved: tgz('not-c', '1.0.0') },
			},
		}),
	});
	t.equal(messages.length, 1, 'only the mismatched leaf is reported');
	t.ok((/`c`/).test(messages[0].message), 'uses the leaf name `c`');
	t.end();
});

test('name-matches-resolved - npm package without resolved is skipped', async (t) => {
	const messages = await run({
		'package-lock.json': JSON.stringify({
			lockfileVersion: 3,
			packages: {
				'': { name: 'root' },
				'node_modules/local': { version: '1.0.0' },
			},
		}),
	});
	t.deepEqual(messages, [], 'no resolved URL means nothing to check');
	t.end();
});

test('name-matches-resolved - npm v1 nested dependencies are walked by leaf name', async (t) => {
	const messages = await run({
		'package-lock.json': JSON.stringify({
			lockfileVersion: 1,
			dependencies: {
				lodash: {
					version: '4.17.21',
					resolved: tgz('lodash', '4.17.21'),
					dependencies: {
						'sub-dep': { version: '1.0.0', resolved: tgz('evil-sub', '1.0.0') },
					},
				},
			},
		}),
	});
	t.equal(messages.length, 1, 'nested mismatch reported');
	t.ok((/`sub-dep`/).test(messages[0].message), 'names the nested key');
	t.ok((/`evil-sub`/).test(messages[0].message), 'names the nested URL package');
	t.end();
});

test('name-matches-resolved - non-registry and malformed URLs are skipped', async (t) => {
	const messages = await run({
		'package-lock.json': JSON.stringify({
			lockfileVersion: 3,
			packages: {
				'': { name: 'root' },
				'node_modules/git-dep': { resolved: 'git+ssh://git@github.com/foo/bar.git#abc' },
				'node_modules/tarball-dep': { resolved: 'https://example.com/foo.tgz' },
				'node_modules/file-dep': { resolved: 'file:../local' },
				'node_modules/bad-url': { resolved: ':::not a url' },
				'node_modules/empty-name': { resolved: 'https://registry.npmjs.org/-/x-1.0.0.tgz' },
			},
		}),
	});
	t.deepEqual(messages, [], 'only registry tarball URLs are policed');
	t.end();
});

test('name-matches-resolved - yarn.lock mismatch and bare-name fallback', async (t) => {
	const yarnLock = [
		'# yarn lockfile v1',
		'',
		'"lodash@^4.17.0":',
		'  version "4.17.21"',
		`  resolved "${tgz('evil', '4.17.21')}"`,
		'',
		'"@babel/core@^7.0.0":',
		'  version "7.0.0"',
		`  resolved "${tgz('@babel/core', '7.0.0')}"`,
		'',
		'noat:',
		'  version "1.0.0"',
		`  resolved "${tgz('noat', '1.0.0')}"`,
	].join('\n');
	const messages = await run({ 'yarn.lock': yarnLock });
	t.equal(messages.length, 1, 'only the mismatched yarn entry is reported');
	t.ok((/`lodash`/).test(messages[0].message), 'names the yarn descriptor');
	t.ok((/`evil`/).test(messages[0].message), 'names the URL package');
	t.end();
});

test('name-matches-resolved - pnpm/bun.lock/vlt store no registry URL, so are skipped', async (t) => {
	t.deepEqual(await run({ 'pnpm-lock.yaml': 'lockfileVersion: \'9.0\'\npackages:\n' }), [], 'pnpm skipped');
	t.deepEqual(await run({ 'bun.lock': '{"lockfileVersion":1,"packages":{}}' }), [], 'bun.lock skipped');
	t.deepEqual(await run({ 'vlt-lock.json': '{"lockfileVersion":0,"nodes":{}}' }), [], 'vlt skipped');
	t.end();
});

test('name-matches-resolved - real bun.lockb is parsed (and matches)', async (t) => {
	const dir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-nmr-bun-'));
	try {
		writeFileSync(join(dir, 'index.js'), 'const x = 1;\n');
		copyFileSync(join(import.meta.dirname, 'fixtures', 'bun.lockb'), join(dir, 'bun.lockb'));
		const eslint = createESLint({
			plugins: { lockfile: plugin },
			rules: { 'lockfile/name-matches-resolved': 'error' },
		}, dir);
		const results = await eslint.lintFiles(['index.js']);
		t.deepEqual(results[0].messages, [], 'real bun.lockb resolves consistent names');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
	t.end();
});

test('name-matches-resolved - bun.lockb with null content yields no entries', async (t) => {
	// Covers extractFromBunLockbBinary's `if (!yarnLockContent)` branch. esmock
	// returns an untyped module, so the fake context needs no casts.
	const mockedRule = await esmock('eslint-plugin-lockfile/rules/name-matches-resolved.mjs', {}, {
		'lockfile-tools/io': {
			loadBunLockbContent() { return null; },
		},
	});
	const dir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-nmr-bunnull-'));
	try {
		writeFileSync(join(dir, 'bun.lockb'), Buffer.from([0x00]));
		/** @type {{ messageId?: string }[]} */
		const reports = [];
		const context = {
			filename: join(dir, 'index.js'),
			/** @param {{ messageId?: string }} info */
			report(info) {
				reports.push(info);
			},
		};
		// eslint-disable-next-line new-cap
		await mockedRule.create(context).Program({ type: 'Program' });
		t.deepEqual(reports, [], 'null bun.lockb content is treated as empty');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
	t.end();
});

test('name-matches-resolved - malformed lockfile is reported', async (t) => {
	const messages = await run({ 'package-lock.json': '{ not valid json' });
	t.equal(messages.length, 1, 'one error');
	t.equal(messages[0].messageId, 'malformedLockfile');
	t.end();
});

test('name-matches-resolved - a non-Error thrown while parsing is stringified', async (t) => {
	// Covers the `: String(e)` branch of the malformed-lockfile handler. esmock
	// returns an untyped module, so the fake context needs no casts.
	const mockedRule = await esmock('eslint-plugin-lockfile/rules/name-matches-resolved.mjs', {}, {
		'lockfile-tools/json-ast': { parseJSON() { throw 'boom'; } }, // eslint-disable-line no-throw-literal
	});
	const dir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-nmr-nonerr-'));
	try {
		writeFileSync(join(dir, 'package-lock.json'), '{}');
		/** @type {{ messageId?: string, data?: Record<string, unknown> }[]} */
		const reports = [];
		const context = {
			filename: join(dir, 'index.js'),
			/** @param {{ messageId?: string, data?: Record<string, unknown> }} info */
			report(info) {
				reports.push(info);
			},
		};
		// eslint-disable-next-line new-cap
		await mockedRule.create(context).Program({ type: 'Program' });
		t.equal(reports.length, 1, 'one report');
		t.equal(reports[0].messageId, 'malformedLockfile');
		t.equal(reports[0].data?.error, 'boom', 'non-Error value is stringified');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
	t.end();
});

test('name-matches-resolved - recommended config fires on a tampered lockfile', skipOnV8, async (t) => {
	const dir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-nmr-rec-'));
	try {
		mkdirSync(join(dir, '.git'));
		writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'app', private: true }));
		writeFileSync(join(dir, 'package-lock.json'), JSON.stringify({
			lockfileVersion: 3,
			packages: {
				'': { name: 'app' },
				'node_modules/lodash': { version: '4.17.21', resolved: tgz('evil', '4.17.21') },
			},
		}));
		const eslint = createESLint(
			plugin.configs.recommended.map((block) => ({ ...block, plugins: { lockfile: plugin } })),
			dir,
		);
		const results = await eslint.lintFiles(['package-lock.json']);
		const { messages } = results[0];
		t.ok(
			messages.some((m) => m.ruleId === 'lockfile/name-matches-resolved'),
			'the rule fires via recommended',
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
	t.end();
});
