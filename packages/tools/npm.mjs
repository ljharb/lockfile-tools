/**
 * npm lockfile-specific utilities
 */

import { forEachMember, getMember } from './json-ast.mjs';

const { entries } = Object;

/**
 * @import {
 * 	traverseDependencies as TraverseDependencies,
 * 	traverseDependenciesAST as TraverseDependenciesAST,
 * 	forEachNpmPackagesMember as ForEachNpmPackagesMember,
 * 	extractPackageName as ExtractPackageName,
 * } from './npm.d.mts'
 */

/** @type {typeof TraverseDependencies} */
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

/** @type {typeof TraverseDependenciesAST} */
export function traverseDependenciesAST(depsObj, callback, prefix = '') {
	forEachMember(depsObj, (member, name) => {
		const fullName = prefix ? `${prefix}/${name}` : name;
		callback(member, fullName); // eslint-disable-line callback-return
		const nested = getMember(member.value, 'dependencies');
		traverseDependenciesAST(nested, callback, fullName);
	});
}

/** @type {typeof ForEachNpmPackagesMember} */
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

/** @type {typeof ExtractPackageName} */
export function extractPackageName(key) {
	// For npm v2/v3: node_modules/package-name or node_modules/@scope/package-name
	const nodeModulesMatch = key.match(/node_modules\/(@?[^/]+(?:\/[^/]+)?)/);
	// For other formats, the key might be the package name directly
	return nodeModulesMatch?.[1] ?? key;
}
