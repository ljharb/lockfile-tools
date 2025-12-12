/**
 * npm lockfile-specific utilities
 */

const { entries } = Object;

/** @typedef {import('./lib/types.d.ts').LockfileDependenciesRecord} LockfileDependenciesRecord */

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
 * Extracts package name from a lockfile key or dependency name
 * @type {(key: string) => string}
 */
export function extractPackageName(key) {
	// For npm v2/v3: node_modules/package-name or node_modules/@scope/package-name
	const nodeModulesMatch = key.match(/node_modules\/(@?[^/]+(?:\/[^/]+)?)/);
	// For other formats, the key might be the package name directly
	return nodeModulesMatch?.[1] ?? key;
}
