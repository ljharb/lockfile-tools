import test from 'tape';
import esmock from 'esmock';

test('buildVirtualLockfile - successful arborist load', async (t) => {
	// Mock arborist to return a successful virtual tree
	const mockInventory = new Map([
		['root', {
			isRoot: true,
			name: 'root',
			version: '1.0.0',
		}],
		['package-a', {
			isRoot: false,
			name: 'package-a',
			version: '1.0.0',
			resolved: 'https://registry.npmjs.org/package-a/-/package-a-1.0.0.tgz',
			integrity: 'sha512-abc123',
		}],
		['package-b', {
			isRoot: false,
			name: 'package-b',
			version: '2.0.0',
			resolved: 'https://registry.npmjs.org/package-b/-/package-b-2.0.0.tgz',
			integrity: 'sha512-def456',
		}],
		['package-c', {
			isRoot: false,
			name: 'package-c',
			version: '3.0.0',
			resolved: null,
			integrity: null,
		}],
	]);

	const mockTree = {
		isRoot: false,
		edgesOut: new Map([
			['package-a', {}],
			['package-b', {}],
		]),
		inventory: mockInventory,
	};

	class MockArborist {
		constructor() {
			this.path = '';
		}

		async loadVirtual() {
			// Use this.path to satisfy linter
			void this.path;
			return mockTree;
		}
	}

	const virtualLockfile = await esmock('lockfile-tools/lib/virtual-lockfile.mjs', {}, {
		'@npmcli/arborist': MockArborist,
	});

	const packages = await virtualLockfile.buildVirtualLockfile('/fake/path');

	t.equal(packages.length, 3, 'returns 3 packages (excluding root)');

	const packageA = packages.find(/** @param {{name?: string}} p */ (p) => p.name === 'package-a');
	t.ok(packageA, 'package-a is included');
	t.equal(packageA.version, '1.0.0', 'package-a has correct version');
	t.equal(packageA.resolved, 'https://registry.npmjs.org/package-a/-/package-a-1.0.0.tgz', 'package-a has resolved URL');
	t.equal(packageA.integrity, 'sha512-abc123', 'package-a has integrity');
	t.equal(packageA.isDirect, true, 'package-a is marked as direct dependency');

	const packageB = packages.find(/** @param {{name?: string}} p */ (p) => p.name === 'package-b');
	t.ok(packageB, 'package-b is included');
	t.equal(packageB.isDirect, true, 'package-b is marked as direct dependency');

	const packageC = packages.find(/** @param {{name?: string}} p */ (p) => p.name === 'package-c');
	t.ok(packageC, 'package-c is included');
	t.equal(packageC.resolved, null, 'package-c has null resolved');
	t.equal(packageC.integrity, null, 'package-c has null integrity');
	t.equal(packageC.isDirect, false, 'package-c is not a direct dependency');

	t.end();
});

test('buildVirtualLockfile - arborist failure', async (t) => {
	class MockArborist {
		constructor() {
			this.path = '';
		}

		async loadVirtual() {
			// Use this.path to satisfy linter
			void this.path;
			throw new Error('Arborist failed');
		}
	}

	const virtualLockfile = await esmock('lockfile-tools/lib/virtual-lockfile.mjs', {}, {
		'@npmcli/arborist': MockArborist,
	});

	const packages = await virtualLockfile.buildVirtualLockfile('/fake/path');

	t.deepEqual(packages, [], 'returns empty array when arborist fails');
	t.end();
});

test('buildVirtualLockfile - tree without edgesOut', async (t) => {
	const mockInventory = new Map([
		['package-a', {
			isRoot: false,
			name: 'package-a',
			version: '1.0.0',
			resolved: 'https://registry.npmjs.org/package-a/-/package-a-1.0.0.tgz',
			integrity: 'sha512-abc123',
		}],
	]);

	const mockTree = {
		isRoot: false,
		edgesOut: null, // No edgesOut
		inventory: mockInventory,
	};

	class MockArborist {
		constructor() {
			this.path = '';
		}

		async loadVirtual() {
			// Use this.path to satisfy linter
			void this.path;
			return mockTree;
		}
	}

	const virtualLockfile = await esmock('lockfile-tools/lib/virtual-lockfile.mjs', {}, {
		'@npmcli/arborist': MockArborist,
	});

	const packages = await virtualLockfile.buildVirtualLockfile('/fake/path');

	t.equal(packages.length, 1, 'returns 1 package');
	t.equal(packages[0].isDirect, false, 'package is not marked as direct (no edgesOut)');
	t.end();
});
