/** @typedef {import('./lib/types.d.ts').RegistryURL} RegistryURL */

/**
 * Normalizes a registry URL by removing trailing slashes
 * @param {string} url - Registry URL
 * @returns {RegistryURL} Normalized URL
 */
export function normalizeRegistry(url) {
	return /** @type {RegistryURL} */ (url.replace(/\/$/, ''));
}

/**
 * Extracts registry URL from a resolved package URL
 * Handles both standard registries (e.g., https://registry.npmjs.org)
 * and path-based registries (e.g., https://artifacts.example.com/api/npm/npm-repo)
 * @param {string} resolved - Resolved package URL (e.g., https://registry.npmjs.org/pkg/-/pkg-1.0.0.tgz)
 * @returns {RegistryURL | null} Registry URL or null if invalid
 */
export function extractRegistryFromUrl(resolved) {
	try {
		const url = new URL(resolved);

		// npm tarball URLs follow the pattern: {registry}/{package}/-/{package}-{version}.tgz
		// Find the /-/ separator which marks the start of the tarball path
		const tarballSeparatorIndex = url.pathname.indexOf('/-/');
		if (tarballSeparatorIndex !== -1) {
			// Extract everything before /-/ as part of the registry path
			const pathBeforeTarball = url.pathname.slice(0, tarballSeparatorIndex);
			// Remove the package name from the end to get the registry path
			// Package names can be scoped (@scope/pkg) or unscoped (pkg)
			const lastSlash = pathBeforeTarball.lastIndexOf('/');
			if (lastSlash !== -1) {
				// Check if it's a scoped package
				const potentialScope = pathBeforeTarball.slice(0, lastSlash);
				const scopeSlash = potentialScope.lastIndexOf('/');
				if (scopeSlash !== -1 && pathBeforeTarball.slice(scopeSlash + 1, lastSlash).startsWith('@')) {
					// Scoped package: /api/npm/repo/@scope/pkg -> /api/npm/repo
					const registryPath = pathBeforeTarball.slice(0, scopeSlash);
					return /** @type {RegistryURL} */ (`${url.protocol}//${url.host}${registryPath}`);
				}
				// Unscoped package: /api/npm/repo/pkg -> /api/npm/repo
				const registryPath = pathBeforeTarball.slice(0, lastSlash);
				return /** @type {RegistryURL} */ (`${url.protocol}//${url.host}${registryPath}`);
			}
		}

		// Fallback: just return protocol + host (for non-standard URLs)
		return /** @type {RegistryURL} */ (`${url.protocol}//${url.host}`);
	} catch {
		return null;
	}
}
