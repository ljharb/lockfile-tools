import test from 'tape';
import {
	mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import esmock from 'esmock';
import plugin from 'eslint-plugin-lockfile';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** @type {(offsetMs: number) => string} */
function ago(offsetMs) {
	return new Date(Date.now() - offsetMs).toISOString();
}

/** @type {(packages: Record<string, object>) => string} */
function npmLock(packages) {
	return JSON.stringify({ lockfileVersion: 3, packages: { '': { name: 'test' }, ...packages } });
}

/** @type {(name: string, version: string) => object} */
function registryPkg(name, version) {
	return { version, resolved: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz` };
}

/** @type {(entries: { descriptor: string, version: string, resolved: string }[]) => string} */
function yarnLock(entries) {
	const lines = ['# yarn lockfile v1', ''];
	entries.forEach((entry) => {
		lines.push(`"${entry.descriptor}":`);
		lines.push(`  version "${entry.version}"`);
		lines.push(`  resolved "${entry.resolved}"`);
		lines.push('');
	});
	return lines.join('\n');
}

/** @type {(packages: Record<string, unknown>) => string} */
function bunLock(packages) {
	return JSON.stringify({
		lockfileVersion: 1, workspaces: { '': { name: 'test' } }, packages,
	});
}

/** @type {(nodes: Record<string, unknown>) => string} */
function vltLock(nodes) {
	return JSON.stringify({ lockfileVersion: 0, nodes });
}

/** @type {(entries: { key: string, integrity?: string, tarball?: string }[]) => string} */
function pnpmLock(entries) {
	const lines = ["lockfileVersion: '9.0'", '', 'packages:', ''];
	entries.forEach((entry) => {
		const fields = [];
		if (entry.tarball) {
			fields.push(`tarball: ${entry.tarball}`);
		}
		if (entry.integrity) {
			fields.push(`integrity: ${entry.integrity}`);
		}
		lines.push(`  ${entry.key}:`);
		lines.push(`    resolution: {${fields.join(', ')}}`);
		lines.push('');
	});
	return lines.join('\n');
}

/**
 * esmocks the rule with `pacoteMock`, writes `files` (+ a `.git` marker so the
 * `.npmrc` walk stops in the temp dir), invokes it with `options`, and returns
 * the collected reports.
 * @param {object} pacoteMock
 * @param {{ files?: Record<string, string>, options?: unknown[], extraMocks?: object }} [opts]
 * @returns {Promise<{ messageId?: string, data?: Record<string, unknown> }[]>}
 */
async function runRule(pacoteMock, opts) {
	const {
		files = {}, options = [], extraMocks = {},
	} = opts || {};
	const mockedRule = await esmock('eslint-plugin-lockfile/rules/minimum-release-age.mjs', {}, {
		pacote: pacoteMock,
		...extraMocks,
	});
	const dir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-mra-'));
	try {
		mkdirSync(join(dir, '.git'));
		Object.keys(files).forEach((name) => {
			writeFileSync(join(dir, name), files[name]);
		});
		/** @type {{ messageId?: string, data?: Record<string, unknown> }[]} */
		const reports = [];
		const context = {
			filename: join(dir, 'index.js'),
			options,
			/** @param {{ messageId?: string, data?: Record<string, unknown> }} info */
			report(info) {
				reports.push(info);
			},
		};
		// eslint-disable-next-line new-cap
		await mockedRule.create(context).Program({ type: 'Program' });
		return reports;
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

/** @type {(times: Record<string, Record<string, string>>) => object} */
function pacoteWithTimes(times) {
	return {
		/** @param {string} name */
		async packument(name) {
			return name in times ? { time: times[name] } : {};
		},
	};
}

test('minimum-release-age - flags a too-new version (default 1-day threshold)', async (t) => {
	const reports = await runRule(
		pacoteWithTimes({ foo: { '1.0.0': ago(5 * MINUTE) } }),
		{ files: { 'package-lock.json': npmLock({ 'node_modules/foo': registryPkg('foo', '1.0.0') }) } },
	);
	t.equal(reports.length, 1, 'one report');
	t.equal(reports[0].messageId, 'tooNew');
	t.equal(reports[0].data?.name, 'foo', 'identifies the package');
	t.equal(reports[0].data?.version, '1.0.0', 'identifies the version');
	t.equal(reports[0].data?.threshold, '24 hour(s)', 'default threshold humanized');
	t.equal(reports[0].data?.age, '5 minute(s)', 'age humanized in minutes');
	t.end();
});

test('minimum-release-age - an old-enough version is fine', async (t) => {
	const reports = await runRule(
		pacoteWithTimes({ foo: { '1.0.0': '2000-01-01T00:00:00.000Z' } }),
		{ files: { 'package-lock.json': npmLock({ 'node_modules/foo': registryPkg('foo', '1.0.0') }) } },
	);
	t.deepEqual(reports, [], 'a long-published version is not flagged');
	t.end();
});

test('minimum-release-age - missing publish time is skipped', async (t) => {
	const reports = await runRule(
		pacoteWithTimes({ bar: { '9.9.9': ago(MINUTE) } }), // foo has no packument time; bar lacks 1.0.0
		{
			files: {
				'package-lock.json': npmLock({
					'node_modules/foo': registryPkg('foo', '1.0.0'),
					'node_modules/bar': registryPkg('bar', '1.0.0'),
				}),
			},
		},
	);
	t.deepEqual(reports, [], 'no publish date means we cannot judge, so we skip');
	t.end();
});

test('minimum-release-age - a fetch failure is reported', async (t) => {
	const reports = await runRule(
		{ async packument() { throw new Error('network down'); } },
		{ files: { 'package-lock.json': npmLock({ 'node_modules/foo': registryPkg('foo', '1.0.0') }) } },
	);
	t.equal(reports.length, 1, 'one report');
	t.equal(reports[0].messageId, 'fetchFailed');
	t.ok((/network down/).test(String(reports[0].data?.error)), 'includes the error message');
	t.end();
});

test('minimum-release-age - a non-Error fetch rejection is stringified', async (t) => {
	const reports = await runRule(
		{ async packument() { throw 'boom'; } }, // eslint-disable-line no-throw-literal
		{ files: { 'package-lock.json': npmLock({ 'node_modules/foo': registryPkg('foo', '1.0.0') }) } },
	);
	t.equal(reports[0].messageId, 'fetchFailed');
	t.equal(reports[0].data?.error, 'boom', 'non-Error rejection stringified');
	t.end();
});

test('minimum-release-age - the option overrides the threshold (and humanizes days)', async (t) => {
	const files = { 'package-lock.json': npmLock({ 'node_modules/foo': registryPkg('foo', '1.0.0') }) };
	const pacoteMock = pacoteWithTimes({ foo: { '1.0.0': ago(3 * DAY) } });

	const withDefault = await runRule(pacoteMock, { files });
	t.deepEqual(withDefault, [], 'a 3-day-old version passes the default 1-day threshold');

	const withOption = await runRule(pacoteMock, { files, options: [5 * 24 * 60] }); // 5 days, in minutes
	t.equal(withOption.length, 1, 'a 5-day threshold flags the 3-day-old version');
	t.equal(withOption[0].data?.age, '3 day(s)', 'age humanized in days');
	t.equal(withOption[0].data?.threshold, '5 day(s)', 'threshold humanized in days');
	t.end();
});

test('minimum-release-age - the threshold is read from .npmrc minimum-release-age', async (t) => {
	const files = {
		'package-lock.json': npmLock({ 'node_modules/foo': registryPkg('foo', '1.0.0') }),
		'.npmrc': 'minimum-release-age=2880\n', // 2 days
	};
	const pacoteMock = pacoteWithTimes({ foo: { '1.0.0': ago(36 * HOUR) } });
	const reports = await runRule(pacoteMock, { files });
	t.equal(reports.length, 1, 'a 36h-old version is flagged against the 2-day .npmrc cooldown');
	t.equal(reports[0].data?.age, '36 hour(s)', 'age humanized in hours');
	t.end();
});

test('minimum-release-age - an invalid .npmrc value falls back to the default', async (t) => {
	const files = {
		'package-lock.json': npmLock({ 'node_modules/foo': registryPkg('foo', '1.0.0') }),
		'.npmrc': 'minimum-release-age=not-a-number\n',
	};
	const pacoteMock = pacoteWithTimes({ foo: { '1.0.0': ago(36 * HOUR) } });
	const reports = await runRule(pacoteMock, { files });
	t.deepEqual(reports, [], 'a non-numeric value is ignored, so the 1-day default applies (36h > 1d)');
	t.end();
});

test('minimum-release-age - non-registry and version-less entries are skipped', async (t) => {
	/** @type {string[]} */
	const calls = [];
	const pacoteMock = {
		/** @param {string} name */
		async packument(name) {
			calls.push(name);
			return {};
		},
	};
	const reports = await runRule(pacoteMock, {
		files: {
			'package-lock.json': npmLock({
				'node_modules/git-dep': { version: '1.0.0', resolved: 'git+ssh://git@github.com/a/b.git#c' },
				'node_modules/no-version': { resolved: 'https://registry.npmjs.org/x/-/x-1.0.0.tgz' },
			}),
		},
	});
	t.deepEqual(reports, [], 'nothing to check');
	t.deepEqual(calls, [], 'pacote is not consulted for skipped entries');
	t.end();
});

test('minimum-release-age - npm v1 nested dependencies are checked', async (t) => {
	const lock = JSON.stringify({
		lockfileVersion: 1,
		dependencies: {
			top: {
				version: '1.0.0',
				resolved: 'https://registry.npmjs.org/top/-/top-1.0.0.tgz',
				dependencies: {
					nested: { version: '2.0.0', resolved: 'https://registry.npmjs.org/nested/-/nested-2.0.0.tgz' },
				},
			},
			'skip-no-resolved': { version: '1.0.0' },
			'skip-no-version': { resolved: 'https://registry.npmjs.org/x/-/x-1.0.0.tgz' },
			'skip-git': { version: '1.0.0', resolved: 'git+ssh://git@github.com/a/b.git#c' },
		},
	});
	const reports = await runRule(
		pacoteWithTimes({ nested: { '2.0.0': ago(MINUTE) }, top: { '1.0.0': '2000-01-01T00:00:00.000Z' } }),
		{ files: { 'package-lock.json': lock } },
	);
	t.equal(reports.length, 1, 'only the too-new nested dep is reported');
	t.equal(reports[0].data?.name, 'nested');
	t.end();
});

test('minimum-release-age - pnpm registry deps are checked (scoped and peer-suffixed too)', async (t) => {
	const reports = await runRule(
		pacoteWithTimes({
			foo: { '1.0.0': ago(5 * MINUTE) },
			'@scope/bar': { '2.0.0': ago(5 * MINUTE) },
			withpeer: { '1.0.0': ago(5 * MINUTE) },
		}),
		{
			files: {
				'pnpm-lock.yaml': pnpmLock([
					{ key: 'foo@1.0.0', integrity: 'sha512-aaa==' },
					{ key: '@scope/bar@2.0.0', integrity: 'sha512-bbb==' },
					{ key: 'withpeer@1.0.0(react@18.0.0)', integrity: 'sha512-ccc==' },
				]),
			},
		},
	);
	const names = reports.map((r) => r.data?.name).sort();
	t.deepEqual(names, ['@scope/bar', 'foo', 'withpeer'], 'name+version parsed from each pnpm key');
	t.end();
});

test('minimum-release-age - pnpm non-registry and keyless entries are skipped', async (t) => {
	/** @type {string[]} */
	const calls = [];
	const pacoteMock = {
		/** @param {string} name */
		async packument(name) {
			calls.push(name);
			return {};
		},
	};
	const reports = await runRule(pacoteMock, {
		files: {
			'pnpm-lock.yaml': pnpmLock([
				{
					key: 'tarred@1.0.0', tarball: 'https://example.com/x.tgz', integrity: 'sha512-ddd==',
				}, // has tarball
				{ key: 'nointegrity@1.0.0', tarball: 'https://example.com/y.tgz' }, // no integrity
				{ key: 'weird', integrity: 'sha512-eee==' }, // no @version
			]),
		},
	});
	t.deepEqual(reports, [], 'tarball, integrity-less, and version-less pnpm entries are skipped');
	t.deepEqual(calls, [], 'pacote is not consulted for skipped entries');
	t.end();
});

test('minimum-release-age - yarn registry deps are checked; non-registry/odd URLs skipped', async (t) => {
	const reports = await runRule(
		pacoteWithTimes({
			lodash: { '4.17.21': ago(5 * MINUTE) },
			'@babel/core': { '7.0.0': ago(5 * MINUTE) },
		}),
		{
			files: {
				'yarn.lock': yarnLock([
					{
						descriptor: 'lodash@^4.17.0', version: '4.17.21', resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz',
					},
					{
						descriptor: '@babel/core@^7.0.0', version: '7.0.0', resolved: 'https://registry.npmjs.org/@babel/core/-/core-7.0.0.tgz',
					},
					{
						descriptor: 'gitdep@x', version: '1.0.0', resolved: 'git+ssh://git@github.com/a/b.git#c',
					}, // bad protocol
					{
						descriptor: 'tardep@x', version: '1.0.0', resolved: 'https://example.com/no-separator.tgz',
					}, // no /-/
					{
						descriptor: 'baddep@x', version: '1.0.0', resolved: ':::not a url',
					}, // unparseable
					{
						descriptor: 'emptyname@x', version: '1.0.0', resolved: 'https://registry.npmjs.org/-/x-1.0.0.tgz',
					}, // empty name
					{
						descriptor: 'mismatch@x', version: '1.0.0', resolved: 'https://registry.npmjs.org/lodash/-/weird-1.0.0.tgz',
					}, // file != name-
				]),
			},
		},
	);
	const names = reports.map((r) => r.data?.name).sort();
	t.deepEqual(names, ['@babel/core', 'lodash'], 'only the well-formed registry tarballs are checked');
	t.end();
});

test('minimum-release-age - bun.lock registry deps are checked; malformed entries skipped', async (t) => {
	const reports = await runRule(
		pacoteWithTimes({ picocolors: { '1.1.1': ago(5 * MINUTE) } }),
		{
			files: {
				'bun.lock': bunLock({
					picocolors: ['picocolors@1.1.1', '1.1.1', {}, 'sha512-aaa=='],
					'not-an-array': 'oops',
					tooshort: ['x@1'],
					'bad-version': ['y@1', 123, {}, 'sha512-bbb=='],
				}),
			},
		},
	);
	t.equal(reports.length, 1, 'only the well-formed bun.lock entry is checked');
	t.equal(reports[0].data?.name, 'picocolors');
	t.end();
});

test('minimum-release-age - bun.lockb is parsed via the yarn path', async (t) => {
	const dir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-mra-bun-'));
	try {
		mkdirSync(join(dir, '.git'));
		copyFileSync(join(import.meta.dirname, 'fixtures', 'bun.lockb'), join(dir, 'bun.lockb'));
		const mockedRule = await esmock('eslint-plugin-lockfile/rules/minimum-release-age.mjs', {}, {
			pacote: { async packument() { return {}; } }, // unknown publish times -> nothing flagged
		});
		/** @type {{ messageId?: string }[]} */
		const reports = [];
		const context = {
			filename: join(dir, 'index.js'),
			options: [],
			/** @param {{ messageId?: string }} info */ report(info) { reports.push(info); },
		};
		// eslint-disable-next-line new-cap
		await mockedRule.create(context).Program({ type: 'Program' });
		t.deepEqual(reports, [], 'real bun.lockb decodes and yields no reports without publish times');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
	t.end();
});

test('minimum-release-age - an unreadable bun.lockb yields no candidates', async (t) => {
	const mockedRule = await esmock('eslint-plugin-lockfile/rules/minimum-release-age.mjs', {}, {
		pacote: { async packument() { return {}; } },
		'lockfile-tools/io': { loadBunLockbContent() { return null; } },
	});
	const dir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-mra-bunnull-'));
	try {
		mkdirSync(join(dir, '.git'));
		writeFileSync(join(dir, 'bun.lockb'), Buffer.from([0x00]));
		/** @type {{ messageId?: string }[]} */
		const reports = [];
		const context = {
			filename: join(dir, 'index.js'),
			options: [],
			/** @param {{ messageId?: string }} info */ report(info) { reports.push(info); },
		};
		// eslint-disable-next-line new-cap
		await mockedRule.create(context).Program({ type: 'Program' });
		t.deepEqual(reports, [], 'null bun.lockb content is treated as empty');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
	t.end();
});

test('minimum-release-age - vlt registry deps are checked; malformed entries skipped', async (t) => {
	const reports = await runRule(
		pacoteWithTimes({ picocolors: { '1.1.1': ago(5 * MINUTE) } }),
		{
			files: {
				'vlt-lock.json': vltLock({
					'··picocolors@1.1.1': [0, 'picocolors', 'sha512-aaa=='],
					'··not-an-array': 'oops',
					'··tooshort@1.0.0': [0],
					'··bad-name@1.0.0': [0, 123, 'sha512-bbb=='],
					noatsign: [0, 'noatsign', 'sha512-ccc=='],
				}),
			},
		},
	);
	t.equal(reports.length, 1, 'only the well-formed vlt node is checked');
	t.equal(reports[0].data?.name, 'picocolors');
	t.end();
});

test('minimum-release-age - an empty yarn lockfile yields no candidates', async (t) => {
	const reports = await runRule(pacoteWithTimes({}), { files: { 'yarn.lock': '# yarn lockfile v1\n' } });
	t.deepEqual(reports, [], 'no entries, nothing to check');
	t.end();
});

test('minimum-release-age - malformed lockfile is reported', async (t) => {
	const reports = await runRule(pacoteWithTimes({}), { files: { 'package-lock.json': '{ not valid json' } });
	t.equal(reports.length, 1, 'one report');
	t.equal(reports[0].messageId, 'malformedLockfile');
	t.end();
});

test('minimum-release-age - a non-Error thrown while parsing is stringified', async (t) => {
	const reports = await runRule(pacoteWithTimes({}), {
		files: { 'package-lock.json': '{}' },
		extraMocks: { 'lockfile-tools/json-ast': { parseJSON() { throw 'boom'; } } }, // eslint-disable-line no-throw-literal
	});
	t.equal(reports.length, 1, 'one report');
	t.equal(reports[0].messageId, 'malformedLockfile');
	t.equal(reports[0].data?.error, 'boom', 'non-Error value is stringified');
	t.end();
});

test('minimum-release-age - is part of the recommended config', async (t) => {
	const [lockfileBlock] = plugin.configs.recommended;
	t.ok(Object.keys(lockfileBlock.rules).includes('lockfile/minimum-release-age'), 'enabled in recommended (lockfile block)');
	t.end();
});
