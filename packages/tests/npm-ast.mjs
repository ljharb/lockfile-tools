import test from 'tape';
import { parseJSON, getRootObject, getMember, memberKey, nodeLine } from 'lockfile-tools/json-ast';
import { forEachNpmPackagesMember, traverseDependenciesAST } from 'lockfile-tools/npm';

test('forEachNpmPackagesMember - walks v2/v3 packages, skipping root and workspace defs', (t) => {
	const text = JSON.stringify({
		lockfileVersion: 3,
		packages: {
			'': { name: 'root' },
			'packages/workspace-pkg': { version: '1.0.0' }, // workspace def, no node_modules/
			'node_modules/foo': { version: '1.0.0' },
			'node_modules/@scope/bar': { version: '2.0.0' },
		},
	}, null, 2);

	const root = getRootObject(parseJSON(text));
	/** @type {string[]} */
	const seen = [];
	forEachNpmPackagesMember(getMember(root, 'packages'), (_member, key) => {
		seen.push(key);
	});

	t.deepEqual(
		seen,
		['node_modules/foo', 'node_modules/@scope/bar'],
		'yields only entries under node_modules/, in source order',
	);
	t.end();
});

test('forEachNpmPackagesMember - skips workspace symlinks (link: true)', (t) => {
	const text = JSON.stringify({
		packages: {
			'node_modules/real-pkg': { version: '1.0.0' },
			'node_modules/symlinked-pkg': { link: true, resolved: 'workspaces/foo' },
		},
	}, null, 2);

	const root = getRootObject(parseJSON(text));
	/** @type {string[]} */
	const seen = [];
	forEachNpmPackagesMember(getMember(root, 'packages'), (_member, key) => {
		seen.push(key);
	});

	t.deepEqual(seen, ['node_modules/real-pkg'], 'workspace symlinks are skipped');
	t.end();
});

test('forEachNpmPackagesMember - skips entries whose value is not an object', (t) => {
	const text = JSON.stringify({
		packages: {
			'node_modules/ok': { version: '1.0.0' },
			'node_modules/weird': null,
		},
	}, null, 2);

	const root = getRootObject(parseJSON(text));
	/** @type {string[]} */
	const seen = [];
	forEachNpmPackagesMember(getMember(root, 'packages'), (_member, key) => {
		seen.push(key);
	});

	t.deepEqual(seen, ['node_modules/ok'], 'non-object values are skipped');
	t.end();
});

test('forEachNpmPackagesMember - is a no-op when packages is missing', (t) => {
	const root = getRootObject(parseJSON('{}'));
	let calls = 0;
	forEachNpmPackagesMember(getMember(root, 'packages'), () => { calls += 1; });
	t.equal(calls, 0, 'callback not invoked when packages key is missing');
	t.end();
});

test('forEachNpmPackagesMember - exposes the source line of each package', (t) => {
	const text = '{\n  "packages": {\n    "node_modules/foo": { "version": "1.0.0" },\n    "node_modules/bar": { "version": "2.0.0" }\n  }\n}';
	const root = getRootObject(parseJSON(text));
	/** @type {Array<[string, number]>} */
	const seen = [];
	forEachNpmPackagesMember(getMember(root, 'packages'), (member, key) => {
		seen.push([key, nodeLine(member)]);
	});
	t.deepEqual(seen, [['node_modules/foo', 3], ['node_modules/bar', 4]], 'lines come from the AST');
	t.end();
});

test('traverseDependenciesAST - recursively walks v1 dependencies with prefixed names', (t) => {
	const text = JSON.stringify({
		dependencies: {
			tape: {
				version: '5.0.0',
				dependencies: {
					'has-flag': {
						version: '4.0.0',
					},
				},
			},
			eslint: { version: '9.0.0' },
		},
	}, null, 2);

	const root = getRootObject(parseJSON(text));
	/** @type {Array<[string, string]>} */
	const seen = [];
	traverseDependenciesAST(getMember(root, 'dependencies'), (member, fullName) => {
		seen.push([fullName, memberKey(member)]);
	});

	t.deepEqual(
		seen,
		[
			['tape', 'tape'],
			['tape/has-flag', 'has-flag'],
			['eslint', 'eslint'],
		],
		'walks depth-first with parent/child full names',
	);
	t.end();
});

test('traverseDependenciesAST - is a no-op when receiver is null/missing', (t) => {
	let calls = 0;
	traverseDependenciesAST(null, () => { calls += 1; });
	traverseDependenciesAST(undefined, () => { calls += 1; });
	const root = getRootObject(parseJSON('{}'));
	traverseDependenciesAST(getMember(root, 'dependencies'), () => { calls += 1; });
	t.equal(calls, 0, 'no callback invocations');
	t.end();
});

test('traverseDependenciesAST - skips nested dependencies whose value is not an Object', (t) => {
	// Defensive: a malformed lockfile where a dep's `dependencies` is not an object.
	const text = JSON.stringify({
		dependencies: {
			pkg: {
				version: '1.0.0',
				dependencies: 'not-an-object',
			},
		},
	}, null, 2);
	const root = getRootObject(parseJSON(text));
	/** @type {string[]} */
	const seen = [];
	traverseDependenciesAST(getMember(root, 'dependencies'), (_member, fullName) => {
		seen.push(fullName);
	});
	t.deepEqual(seen, ['pkg'], 'parent yielded but malformed nested deps do not throw or recurse');
	t.end();
});
