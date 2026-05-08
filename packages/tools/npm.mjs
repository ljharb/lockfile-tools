/**
 * npm lockfile-specific utilities
 */

import { forEachMember, getMember } from './json-ast.mjs';

const { entries } = Object;

/** @typedef {import('./lib/types.d.ts').LockfileDependenciesRecord} LockfileDependenciesRecord */
/** @typedef {import('@humanwhocodes/momoa').ObjectNode} ObjectNode */
/** @typedef {import('@humanwhocodes/momoa').MemberNode} MemberNode */
/** @typedef {import('@humanwhocodes/momoa').ValueNode} ValueNode */

/**
 * Recursively traverses npm lockfile v1 dependencies
 * @param {LockfileDependenciesRecord} deps - Dependencies object
 * @param {(name: string, dep: import('./lib/types.d.ts').LockfileDependencyEntry) => void} callback - Called for each dependency
 * @param {string} [prefix=''] - Current path prefix for nested dependencies
 */
export function traverseDependencies(deps, callback, prefix = '') {
	entries(deps).forEach(([name, dep]) => {
		const fullName = prefix ? `${prefix}/${name}` : name;
		const { dependencies } = dep;
		callback(fullName, dep); // eslint-disable-line callback-return
		if (dependencies) {
			traverseDependencies(dependencies, callback, fullName);
		}
	});
}

/**
 * Recursively traverses an npm lockfile v1 `dependencies` object as a momoa
 * AST. Each callback receives the dependency Member node (so the caller can
 * inspect its source line and walk its value) and the joined `parent/child`
 * full name.
 * @param {ValueNode | null | undefined} depsObj
 * @param {(member: MemberNode, fullName: string) => void} callback
 * @param {string} [prefix='']
 */
export function traverseDependenciesAST(depsObj, callback, prefix = '') {
	forEachMember(depsObj, (member, name) => {
		const fullName = prefix ? `${prefix}/${name}` : name;
		callback(member, fullName); // eslint-disable-line callback-return
		const nested = getMember(member.value, 'dependencies');
		traverseDependenciesAST(nested, callback, fullName);
	});
}

/**
 * Iterates the `packages` object of an npm lockfile v2/v3 (a momoa AST),
 * skipping the root entry and workspace symlinks. Yields each package
 * Member node with its lockfile key (e.g. `node_modules/@scope/pkg`).
 * @param {ValueNode | null | undefined} packagesObj
 * @param {(member: MemberNode, key: string) => void} callback
 */
export function forEachNpmPackagesMember(packagesObj, callback) {
	forEachMember(packagesObj, (member, key) => {
		if (key === '') {
			return; // root package
		}
		if (!key.startsWith('node_modules/')) {
			return; // workspace package definitions
		}
		if (member.value.type !== 'Object') {
			return;
		}
		const link = getMember(member.value, 'link');
		if (link && link.type === 'Boolean' && link.value) {
			return; // workspace symlink
		}
		callback(member, key);
	});
}

/**
 * Extracts package name from a lockfile key or dependency name
 * @type {(key: string) => string}
 */
export function extractPackageName(key) {
	// For npm v2/v3: node_modules/package-name or node_modules/@scope/package-name
	const nodeModulesMatch = key.match(/node_modules\/(@?[^/]+(?:\/[^/]+)?)/);
	// For other formats, the key might be the package name directly
	return nodeModulesMatch?.[1] ?? key;
}
