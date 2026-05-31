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
 * Writes a sibling `package.json` (unless `pkg` is null) plus `files` into a
 * fresh temp dir, lints `index.js` with the rule, and returns the messages.
 * @param {{ pkg?: object | null, files?: Record<string, string> }} [opts]
 * @returns {Promise<import('eslint').Linter.LintMessage[]>}
 */
async function run(opts) {
	const { pkg = { name: 'test' }, files = {} } = opts || {};
	const dir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-ms-'));
	try {
		writeFileSync(join(dir, 'index.js'), 'const x = 1;\n');
		if (pkg !== null) {
			writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
		}
		Object.keys(files).forEach((name) => {
			writeFileSync(join(dir, name), files[name]);
		});
		const eslint = createESLint({
			plugins: { lockfile: plugin },
			rules: { 'lockfile/manifest-sync': 'error' },
		}, dir);
		const results = await eslint.lintFiles(['index.js']);
		return results[0].messages;
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

/** @type {(root: object) => string} */
function npmLock(root) {
	return JSON.stringify({ lockfileVersion: 3, packages: { '': root, 'node_modules/x': { version: '1.0.0' } } });
}

/** @type {(workspaceRoot: object | null) => string} */
function bunLock(workspaceRoot) {
	return JSON.stringify({
		lockfileVersion: 1,
		workspaces: workspaceRoot === null ? {} : { '': workspaceRoot },
		packages: {},
	});
}

/** @type {(edges: Record<string, unknown>) => string} */
function vltLock(edges) {
	return JSON.stringify({
		lockfileVersion: 0, nodes: {}, edges,
	});
}

/** @type {(importers: Record<string, Record<string, Record<string, string>>>) => string} */
function pnpmLock(importers) {
	return /** @type {string[]} */ ([]).concat(
		"lockfileVersion: '9.0'\n",
		'importers:\n',
		Object.entries(importers).flatMap(([
			importer,
			depTypes,
		]) => /** @type {string[]} */ ([]).concat(
			`  ${importer}:`,
			Object.entries(depTypes).flatMap(([
				depType,
				deps,
			]) => /** @type {string[]} */ ([]).concat(
				`    ${depType}:`,
				Object.entries(deps).flatMap(([name, specifier]) => [
					`      ${name}:`,
					`        specifier: ${specifier}`,
					'        version: 0.0.0',
				]),
			)),
		)),
		// a `packages:` section with an entry, so the parser also walks indented
		// lines outside the `importers:` section
		'\npackages:\n',
		'  somepkg@1.0.0:',
		'    resolution: {integrity: sha512-x==}',
	).join('\n');
}

test('manifest-sync - in-sync manifest and lockfile is fine', async (t) => {
	const messages = await run({
		pkg: {
			name: 'test',
			dependencies: { lodash: '^4.17.0' },
			devDependencies: { tape: '^5.0.0' },
		},
		files: {
			'package-lock.json': npmLock({
				name: 'test',
				dependencies: { lodash: '^4.17.0' },
				devDependencies: { tape: '^5.0.0' },
			}),
		},
	});
	t.deepEqual(messages, [], 'no errors when manifest and lockfile agree');
	t.end();
});

test('manifest-sync - dependency missing from the lockfile', async (t) => {
	const messages = await run({
		pkg: { name: 'test', dependencies: { lodash: '^4.17.0', added: '^1.0.0' } },
		files: { 'package-lock.json': npmLock({ name: 'test', dependencies: { lodash: '^4.17.0' } }) },
	});
	t.equal(messages.length, 1, 'one error');
	t.equal(messages[0].messageId, 'missing');
	t.ok((/`added`/).test(messages[0].message), 'names the missing dep');
	t.end();
});

test('manifest-sync - dependency extraneous in the lockfile', async (t) => {
	const messages = await run({
		pkg: { name: 'test', dependencies: { lodash: '^4.17.0' } },
		files: { 'package-lock.json': npmLock({ name: 'test', dependencies: { lodash: '^4.17.0', ghost: '^9.9.9' } }) },
	});
	t.equal(messages.length, 1, 'one error');
	t.equal(messages[0].messageId, 'extraneous');
	t.ok((/`ghost`/).test(messages[0].message), 'names the extraneous dep');
	t.end();
});

test('manifest-sync - range mismatch between manifest and lockfile', async (t) => {
	const messages = await run({
		pkg: { name: 'test', dependencies: { lodash: '^4.17.0' } },
		files: { 'package-lock.json': npmLock({ name: 'test', dependencies: { lodash: '^4.0.0' } }) },
	});
	t.equal(messages.length, 1, 'one error');
	t.equal(messages[0].messageId, 'rangeMismatch');
	t.ok((/\^4\.17\.0/).test(messages[0].message) && (/\^4\.0\.0/).test(messages[0].message), 'shows both ranges');
	t.end();
});

test('manifest-sync - checks devDependencies, optionalDependencies, peerDependencies too', async (t) => {
	const messages = await run({
		pkg: {
			name: 'test',
			devDependencies: { tape: '^5.0.0' },
			optionalDependencies: { fsevents: '^2.0.0' },
			peerDependencies: { eslint: '^9.0.0' },
		},
		files: {
			'package-lock.json': npmLock({
				name: 'test',
				devDependencies: { tape: '^5.0.0' },
				// optionalDependencies missing -> one `missing`
				peerDependencies: { eslint: '^8.0.0' }, // range mismatch
			}),
		},
	});
	const ids = messages.map((m) => m.messageId).sort();
	t.deepEqual(ids, ['missing', 'rangeMismatch'], 'reports across dep types');
	t.end();
});

test('manifest-sync - non-string ranges are ignored on both sides', async (t) => {
	const messages = await run({
		pkg: { name: 'test', dependencies: { weird: 123 } },
		files: { 'package-lock.json': npmLock({ name: 'test', dependencies: { weird: 123 } }) },
	});
	t.deepEqual(messages, [], 'numeric ranges are skipped, so nothing is compared');
	t.end();
});

test('manifest-sync - a non-object dependency block is ignored', async (t) => {
	const messages = await run({
		pkg: { name: 'test', dependencies: 'not-an-object' },
		files: { 'package-lock.json': npmLock({ name: 'test' }) },
	});
	t.deepEqual(messages, [], 'a non-object dependencies field yields no comparison');
	t.end();
});

test('manifest-sync - a v1 lockfile (no packages map) is skipped', async (t) => {
	const messages = await run({
		pkg: { name: 'test', dependencies: { lodash: '^4.17.0' } },
		files: { 'package-lock.json': JSON.stringify({ lockfileVersion: 1, dependencies: { lodash: { version: '4.17.21' } } }) },
	});
	t.deepEqual(messages, [], 'v1 lockfiles cannot be compared, so are skipped');
	t.end();
});

test('manifest-sync - a lockfile without a root entry is skipped', async (t) => {
	const messages = await run({
		pkg: { name: 'test', dependencies: { lodash: '^4.17.0' } },
		files: { 'package-lock.json': JSON.stringify({ lockfileVersion: 3, packages: { 'node_modules/x': { version: '1.0.0' } } }) },
	});
	t.deepEqual(messages, [], 'no root entry means nothing to compare');
	t.end();
});

test('manifest-sync - yarn lockfiles are skipped (no separable root manifest)', async (t) => {
	const messages = await run({
		pkg: { name: 'test', dependencies: { lodash: '^4.17.0' } },
		files: { 'yarn.lock': '# yarn lockfile v1\n' },
	});
	t.deepEqual(messages, [], 'yarn is not compared');
	t.end();
});

test('manifest-sync - absent package.json is skipped', async (t) => {
	const messages = await run({
		pkg: null,
		files: { 'package-lock.json': npmLock({ name: 'test', dependencies: { lodash: '^4.17.0' } }) },
	});
	t.deepEqual(messages, [], 'no manifest means nothing to compare against');
	t.end();
});

test('manifest-sync - malformed lockfile is reported', async (t) => {
	const messages = await run({
		pkg: { name: 'test', dependencies: { lodash: '^4.17.0' } },
		files: { 'package-lock.json': '{ not valid json' },
	});
	t.equal(messages.length, 1, 'one error');
	t.equal(messages[0].messageId, 'malformedLockfile');
	t.end();
});

test('manifest-sync - a non-Error thrown while parsing is stringified', async (t) => {
	// Covers the `: String(e)` branch of the malformed-lockfile handler. esmock
	// returns an untyped module, so the fake context needs no casts.
	const mockedRule = await esmock('eslint-plugin-lockfile/rules/manifest-sync.mjs', {}, {
		'lockfile-tools/json-ast': { parseJSON() { throw 'boom'; } }, // eslint-disable-line no-throw-literal
	});
	const dir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-ms-nonerr-'));
	try {
		writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'test', dependencies: { lodash: '^4.17.0' } }));
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

test('manifest-sync - pnpm root importer is compared', async (t) => {
	const inSync = await run({
		pkg: {
			name: 'test', dependencies: { lodash: '^4.17.0' }, devDependencies: { tape: '^5.0.0' },
		},
		files: {
			'pnpm-lock.yaml': pnpmLock({
				'.': {
					dependencies: { lodash: '^4.17.0' },
					devDependencies: { tape: '^5.0.0' },
					dependenciesMeta: { lodash: 'x' }, // non-tracked block, ignored
				},
				'packages/sub': { dependencies: { ignored: '^1.0.0' } }, // non-root importer, ignored
			}),
		},
	});
	t.deepEqual(inSync, [], 'in-sync pnpm importer (non-root importer + meta block ignored) is fine');

	const drifted = await run({
		pkg: { name: 'test', dependencies: { lodash: '^4.17.0', added: '^1.0.0' } },
		files: { 'pnpm-lock.yaml': pnpmLock({ '.': { dependencies: { lodash: '^4.0.0', ghost: '^9.9.9' } } }) },
	});
	const ids = drifted.map((m) => m.messageId).sort();
	t.deepEqual(ids, ['extraneous', 'missing', 'rangeMismatch'], 'pnpm drift is reported');
	t.end();
});

test('manifest-sync - pnpm without a root importer is skipped', async (t) => {
	const messages = await run({
		pkg: { name: 'test', dependencies: { lodash: '^4.17.0' } },
		files: { 'pnpm-lock.yaml': pnpmLock({ 'packages/sub': { dependencies: { x: '^1.0.0' } } }) },
	});
	t.deepEqual(messages, [], 'no `.` importer -> skipped');
	t.end();
});

test('manifest-sync - bun.lock workspace root is compared', async (t) => {
	const inSync = await run({
		pkg: {
			name: 'test', dependencies: { lodash: '^4.17.0' }, devDependencies: { tape: '^5.0.0' },
		},
		files: {
			'bun.lock': bunLock({
				name: 'test', dependencies: { lodash: '^4.17.0' }, devDependencies: { tape: '^5.0.0' },
			}),
		},
	});
	t.deepEqual(inSync, [], 'in-sync bun.lock is fine');

	const drifted = await run({
		pkg: { name: 'test', dependencies: { lodash: '^4.17.0', added: '^1.0.0' } },
		files: {
			'bun.lock': bunLock({
				name: 'test', dependencies: {
					lodash: '^4.0.0', ghost: '^9.9.9', notString: 1,
				},
			}),
		},
	});
	const ids = drifted.map((m) => m.messageId).sort();
	t.deepEqual(ids, ['extraneous', 'missing', 'rangeMismatch'], 'bun.lock drift is reported (non-string entry ignored)');
	t.end();
});

test('manifest-sync - bun.lock without a root workspace is skipped', async (t) => {
	const messages = await run({
		pkg: { name: 'test', dependencies: { lodash: '^4.17.0' } },
		files: { 'bun.lock': bunLock(null) },
	});
	t.deepEqual(messages, [], 'no workspaces[""] means nothing to compare');
	t.end();
});

test('manifest-sync - vlt root edges are compared', async (t) => {
	const inSync = await run({
		pkg: {
			name: 'test', dependencies: { lodash: '^4.17.0' }, devDependencies: { '@scope/tap': '^5.0.0' },
		},
		files: {
			'vlt-lock.json': vltLock({
				'file·. lodash': 'prod ^4.17.0 ··lodash@4.17.21',
				'file·. @scope/tap': 'dev ^5.0.0 ··@scope/tap@5.0.0',
				'··lodash@4.17.21 transitive': 'prod ^1.0.0 ··transitive@1.0.0', // non-root edge, ignored
			}),
		},
	});
	t.deepEqual(inSync, [], 'in-sync vlt edges (incl scoped + non-root edge) are fine');

	const drifted = await run({
		pkg: { name: 'test', dependencies: { lodash: '^4.17.0', added: '^1.0.0' } },
		files: {
			'vlt-lock.json': vltLock({
				'file·. lodash': 'prod ^4.0.0 ··lodash@4.17.21', // range mismatch
				'file·. ghost': 'prod ^9.9.9 ··ghost@9.9.9', // extraneous
				'file·. peerthing': 'peer ^1.0.0 ··peerthing@1.0.0', // peer edge: not compared
				'file·. malformed': 42, // non-string value, ignored
				'file·. novalue': 'prod', // no specifier token, ignored
			}),
		},
	});
	const ids = drifted.map((m) => m.messageId).sort();
	t.deepEqual(ids, ['extraneous', 'missing', 'rangeMismatch'], 'vlt drift is reported; peer/malformed edges ignored');
	t.end();
});

test('manifest-sync - vlt without edges, or without root edges, is skipped', async (t) => {
	const noEdges = await run({
		pkg: { name: 'test', dependencies: { lodash: '^4.17.0' } },
		files: { 'vlt-lock.json': JSON.stringify({ lockfileVersion: 0, nodes: {} }) },
	});
	t.deepEqual(noEdges, [], 'no edges section -> skipped');

	const noRootEdges = await run({
		pkg: { name: 'test', dependencies: { lodash: '^4.17.0' } },
		files: { 'vlt-lock.json': vltLock({ '··lodash@4.17.21 transitive': 'prod ^1.0.0 ··transitive@1.0.0' }) },
	});
	t.deepEqual(noRootEdges, [], 'no root (file·.) edges -> skipped, no false positives');
	t.end();
});

test('manifest-sync - recommended config fires on a drifted lockfile', skipOnV8, async (t) => {
	const dir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-ms-rec-'));
	try {
		mkdirSync(join(dir, '.git'));
		writeFileSync(join(dir, 'package.json'), JSON.stringify({
			name: 'app',
			private: true,
			dependencies: { lodash: '^4.17.0' },
		}));
		writeFileSync(join(dir, 'package-lock.json'), npmLock({ name: 'app', dependencies: {} }));
		const eslint = createESLint(
			plugin.configs.recommended.map((block) => ({ ...block, plugins: { lockfile: plugin } })),
			dir,
		);
		const results = await eslint.lintFiles(['package-lock.json']);
		const { messages } = results[0];
		t.ok(
			messages.some((m) => m.ruleId === 'lockfile/manifest-sync' && m.messageId === 'missing'),
			'the rule fires via recommended',
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
	t.end();
});
