import test from 'tape';
import {
	mkdtempSync, mkdirSync, writeFileSync, rmSync,
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
 * Writes `files` into a fresh temp dir, lints `index.js` with the rule (using
 * `allow` as the option when provided), and returns the messages.
 * @param {Record<string, string>} files
 * @param {string[]} [allow]
 * @returns {Promise<import('eslint').Linter.LintMessage[]>}
 */
async function run(files, allow) {
	const dir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-nis-'));
	try {
		writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'test' }));
		writeFileSync(join(dir, 'index.js'), 'const x = 1;\n');
		Object.keys(files).forEach((name) => {
			writeFileSync(join(dir, name), files[name]);
		});
		const eslint = createESLint({
			plugins: { lockfile: plugin },
			rules: { 'lockfile/no-install-scripts': allow ? ['error', allow] : 'error' },
		}, dir);
		const results = await eslint.lintFiles(['index.js']);
		return results[0].messages;
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

/** @type {(packages: Record<string, object>) => string} */
function npmLock(packages) {
	return JSON.stringify({ lockfileVersion: 3, packages: { '': { name: 'test' }, ...packages } });
}

/** @type {(extra: object) => string} */
function pkgJson(extra) {
	return JSON.stringify({ name: 'test', ...extra });
}

/** A lockfile with a single scripted `esbuild@0.1.0`, the fixture most native-approval tests share. */
const scriptedEsbuild = npmLock({ 'node_modules/esbuild': { version: '0.1.0', hasInstallScript: true } });

test('no-install-scripts - flags a package that runs install scripts', async (t) => {
	const messages = await run({
		'package-lock.json': npmLock({
			'node_modules/esbuild': { version: '0.1.0', hasInstallScript: true },
			'node_modules/lodash': { version: '4.17.21' },
		}),
	});
	t.equal(messages.length, 1, 'only the scripted package is reported');
	t.equal(messages[0].messageId, 'installScript');
	t.ok((/`esbuild`/).test(messages[0].message), 'names the scripted package');
	t.end();
});

test('no-install-scripts - a package without install scripts is fine', async (t) => {
	const messages = await run({
		'package-lock.json': npmLock({
			'node_modules/lodash': { version: '4.17.21' },
			'node_modules/x': { version: '1.0.0', hasInstallScript: false },
		}),
	});
	t.deepEqual(messages, [], 'no install scripts, no report');
	t.end();
});

test('no-install-scripts - an allow-listed package is not reported', async (t) => {
	const messages = await run({
		'package-lock.json': npmLock({ 'node_modules/esbuild': { version: '0.1.0', hasInstallScript: true } }),
	}, ['esbuild']);
	t.deepEqual(messages, [], 'exact-name allowlist entry suppresses the report');
	t.end();
});

test('no-install-scripts - allowlist globs match scoped packages', async (t) => {
	const messages = await run({
		'package-lock.json': npmLock({
			'node_modules/@myorg/native': { version: '1.0.0', hasInstallScript: true },
			'node_modules/sharp': { version: '1.0.0', hasInstallScript: true },
		}),
	}, ['@myorg/*']);
	t.equal(messages.length, 1, 'only the non-allowed package is reported');
	t.ok((/`sharp`/).test(messages[0].message), 'sharp is still flagged');
	t.end();
});

test('no-install-scripts - nested dependency is reported by its leaf name', async (t) => {
	const messages = await run({
		'package-lock.json': npmLock({
			'node_modules/a/node_modules/native-dep': { version: '1.0.0', hasInstallScript: true },
		}),
	});
	t.equal(messages.length, 1, 'one report');
	t.ok((/`native-dep`/).test(messages[0].message), 'uses the leaf package name');
	t.end();
});

test('no-install-scripts - non-npm and v1 lockfiles are skipped', async (t) => {
	t.deepEqual(await run({ 'yarn.lock': '# yarn lockfile v1\n' }), [], 'yarn skipped');
	t.deepEqual(await run({ 'pnpm-lock.yaml': 'lockfileVersion: \'9.0\'\npackages:\n' }), [], 'pnpm skipped');
	t.deepEqual(
		await run({ 'package-lock.json': JSON.stringify({ lockfileVersion: 1, dependencies: { x: { version: '1.0.0' } } }) }),
		[],
		'npm v1 skipped (no hasInstallScript)',
	);
	t.end();
});

test('no-install-scripts - malformed lockfile is reported', async (t) => {
	const messages = await run({ 'package-lock.json': '{ not valid json' });
	t.equal(messages.length, 1, 'one error');
	t.equal(messages[0].messageId, 'malformedLockfile');
	t.end();
});

test('no-install-scripts - a non-Error thrown while parsing is stringified', async (t) => {
	const mockedRule = await esmock('eslint-plugin-lockfile/rules/no-install-scripts.mjs', {}, {
		'lockfile-tools/json-ast': { parseJSON() { throw 'boom'; } }, // eslint-disable-line no-throw-literal
	});
	const dir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-nis-nonerr-'));
	try {
		writeFileSync(join(dir, 'package-lock.json'), '{}');
		/** @type {{ messageId?: string, data?: Record<string, unknown> }[]} */
		const reports = [];
		const context = {
			filename: join(dir, 'index.js'),
			options: [],
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

test('no-install-scripts - npm >= 11.16 via packageManager: an approved package is not flagged', async (t) => {
	const messages = await run({
		'package.json': pkgJson({ packageManager: 'npm@11.16.0', allowScripts: { esbuild: true } }),
		'package-lock.json': scriptedEsbuild,
	});
	t.deepEqual(messages, [], 'a package approved in allowScripts is not flagged');
	t.end();
});

test('no-install-scripts - npm >= 11.16 via engines.npm: an approved package is not flagged', async (t) => {
	const messages = await run({
		'package.json': pkgJson({ engines: { npm: '>=11.16.0' }, allowScripts: { esbuild: true } }),
		'package-lock.json': scriptedEsbuild,
	});
	t.deepEqual(messages, [], 'an engines.npm floor >= 11.16 activates native approvals');
	t.end();
});

test('no-install-scripts - allowScripts is ignored when npm < 11.16', async (t) => {
	const messages = await run({
		'package.json': pkgJson({ packageManager: 'npm@10.0.0', allowScripts: { esbuild: true } }),
		'package-lock.json': scriptedEsbuild,
	});
	t.equal(messages.length, 1, 'without npm >= 11.16 the allowScripts approval is not honored');
	t.equal(messages[0].messageId, 'installScript');
	t.end();
});

test('no-install-scripts - a non-npm packageManager falls through to engines.npm', async (t) => {
	const messages = await run({
		'package.json': pkgJson({
			packageManager: 'yarn@4.0.0',
			engines: { npm: '>=11.16.0' },
			allowScripts: { esbuild: true },
		}),
		'package-lock.json': scriptedEsbuild,
	});
	t.deepEqual(messages, [], 'engines.npm is consulted when packageManager is not npm');
	t.end();
});

test('no-install-scripts - an unparseable npm@ packageManager version is no signal', async (t) => {
	const messages = await run({
		'package.json': pkgJson({ packageManager: 'npm@', allowScripts: { esbuild: true } }),
		'package-lock.json': scriptedEsbuild,
	});
	t.equal(messages.length, 1, 'an unparseable npm@ version does not activate approvals');
	t.end();
});

test('no-install-scripts - engines.npm with a floor below 11.16 is no signal', async (t) => {
	const messages = await run({
		'package.json': pkgJson({ engines: { npm: '^10.0.0' }, allowScripts: { esbuild: true } }),
		'package-lock.json': scriptedEsbuild,
	});
	t.equal(messages.length, 1, 'an engines.npm floor < 11.16 is not enough');
	t.end();
});

test('no-install-scripts - an unparseable engines.npm range is ignored', async (t) => {
	const messages = await run({
		'package.json': pkgJson({ engines: { npm: 'garbage' }, allowScripts: { esbuild: true } }),
		'package-lock.json': scriptedEsbuild,
	});
	t.equal(messages.length, 1, 'an invalid engines.npm range gives no signal');
	t.end();
});

test('no-install-scripts - a contradictory engines.npm range has no floor', async (t) => {
	const messages = await run({
		'package.json': pkgJson({ engines: { npm: '>=2.0.0 <1.0.0' }, allowScripts: { esbuild: true } }),
		'package-lock.json': scriptedEsbuild,
	});
	t.equal(messages.length, 1, 'a range no version can satisfy yields no minimum');
	t.end();
});

test('no-install-scripts - an explicitly denied package is still reported', async (t) => {
	const messages = await run({
		'package.json': pkgJson({ packageManager: 'npm@11.16.0', allowScripts: { esbuild: false } }),
		'package-lock.json': scriptedEsbuild,
	});
	t.equal(messages.length, 1, 'a denied package that ships install scripts is flagged');
	t.equal(messages[0].messageId, 'installScript');
	t.end();
});

test('no-install-scripts - a non-boolean allowScripts entry is ignored', async (t) => {
	const messages = await run({
		'package.json': pkgJson({ packageManager: 'npm@11.16.0', allowScripts: { esbuild: 'yes' } }),
		'package-lock.json': scriptedEsbuild,
	});
	t.equal(messages.length, 1, 'a non-boolean entry is not treated as an approval');
	t.end();
});

test('no-install-scripts - allowScripts keys that name no package are skipped', async (t) => {
	const messages = await run({
		'package.json': pkgJson({ packageManager: 'npm@11.16.0', allowScripts: { '': true, './local': true } }),
		'package-lock.json': scriptedEsbuild,
	});
	t.equal(messages.length, 1, 'an unparseable or nameless key never approves anything');
	t.end();
});

test('no-install-scripts - an approval for a different package does not suppress', async (t) => {
	const messages = await run({
		'package.json': pkgJson({ packageManager: 'npm@11.16.0', allowScripts: { lodash: true } }),
		'package-lock.json': scriptedEsbuild,
	});
	t.equal(messages.length, 1, 'only the named package is approved');
	t.end();
});

test('no-install-scripts - a version-pinned approval only covers that version', async (t) => {
	const match = await run({
		'package.json': pkgJson({ packageManager: 'npm@11.16.0', allowScripts: { 'esbuild@0.1.0': true } }),
		'package-lock.json': scriptedEsbuild,
	});
	t.deepEqual(match, [], 'the approved version is not flagged');

	const mismatch = await run({
		'package.json': pkgJson({ packageManager: 'npm@11.16.0', allowScripts: { 'esbuild@0.1.0': true } }),
		'package-lock.json': npmLock({ 'node_modules/esbuild': { version: '0.2.0', hasInstallScript: true } }),
	});
	t.equal(mismatch.length, 1, 'a different version is still flagged');
	t.end();
});

test('no-install-scripts - a lockfile entry with no version', async (t) => {
	const bare = await run({
		'package.json': pkgJson({ packageManager: 'npm@11.16.0', allowScripts: { esbuild: true } }),
		'package-lock.json': npmLock({ 'node_modules/esbuild': { hasInstallScript: true } }),
	});
	t.deepEqual(bare, [], 'a bare-name approval covers an entry with no version');

	const pinned = await run({
		'package.json': pkgJson({ packageManager: 'npm@11.16.0', allowScripts: { 'esbuild@0.1.0': true } }),
		'package-lock.json': npmLock({ 'node_modules/esbuild': { hasInstallScript: true } }),
	});
	t.equal(pinned.length, 1, 'a version-pinned approval cannot cover an entry with no version');
	t.end();
});

test('no-install-scripts - .npmrc allow-scripts is honored when there is no allowScripts field', async (t) => {
	const messages = await run({
		'package.json': pkgJson({ packageManager: 'npm@11.16.0' }),
		'.npmrc': '; project config\nallow-scripts=esbuild,,./local\n',
		'package-lock.json': scriptedEsbuild,
	});
	t.deepEqual(messages, [], 'a package listed in the .npmrc allow-scripts fallback is not flagged');
	t.end();
});

test('no-install-scripts - the allowScripts field takes precedence over .npmrc allow-scripts', async (t) => {
	const messages = await run({
		'package.json': pkgJson({ packageManager: 'npm@11.16.0', allowScripts: { lodash: true } }),
		'.npmrc': 'allow-scripts=esbuild\n',
		'package-lock.json': scriptedEsbuild,
	});
	t.equal(messages.length, 1, 'the .npmrc fallback is ignored when an allowScripts field is present');
	t.end();
});

test('no-install-scripts - npm >= 11.16 with no approvals flags scripted packages', async (t) => {
	const noNpmrc = await run({
		'package.json': pkgJson({ packageManager: 'npm@11.16.0' }),
		'package-lock.json': scriptedEsbuild,
	});
	t.equal(noNpmrc.length, 1, 'no allowScripts field and no .npmrc: nothing is approved');

	const npmrcWithoutAllowScripts = await run({
		'package.json': pkgJson({ packageManager: 'npm@11.16.0' }),
		'.npmrc': '# unrelated\nsave-exact=true\n',
		'package-lock.json': scriptedEsbuild,
	});
	t.equal(npmrcWithoutAllowScripts.length, 1, 'an .npmrc without allow-scripts approves nothing');
	t.end();
});

test('no-install-scripts - a malformed package.json disables native approvals', async (t) => {
	const messages = await run({
		'package.json': '{ not valid json',
		'package-lock.json': scriptedEsbuild,
	});
	t.equal(messages.length, 1, 'a malformed package.json is ignored; the package is still flagged');
	t.end();
});

test('no-install-scripts - a missing package.json disables native approvals', async (t) => {
	const dir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-nis-nopkg-'));
	try {
		writeFileSync(join(dir, 'index.js'), 'const x = 1;\n');
		writeFileSync(join(dir, 'package-lock.json'), scriptedEsbuild);
		const eslint = createESLint({
			plugins: { lockfile: plugin },
			rules: { 'lockfile/no-install-scripts': 'error' },
		}, dir);
		const results = await eslint.lintFiles(['index.js']);
		t.equal(results[0].messages.length, 1, 'with no package.json, native approvals are inactive');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
	t.end();
});

test('no-install-scripts - recommended config flags scripted packages by default', skipOnV8, async (t) => {
	const dir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-nis-rec-'));
	try {
		mkdirSync(join(dir, '.git'));
		writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'app', private: true }));
		writeFileSync(join(dir, 'package-lock.json'), npmLock({ 'node_modules/esbuild': { version: '0.1.0', hasInstallScript: true } }));
		const eslint = createESLint(
			plugin.configs.recommended.map((block) => ({ ...block, plugins: { lockfile: plugin } })),
			dir,
		);
		const results = await eslint.lintFiles(['package-lock.json']);
		const { messages } = results[0];
		t.ok(
			messages.some((m) => m.ruleId === 'lockfile/no-install-scripts'),
			'the rule fires via recommended',
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
	t.end();
});
