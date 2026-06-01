/**
 * @import {
 * 	normalizeRegistry as NormalizeRegistry,
 * 	extractRegistryFromUrl as ExtractRegistryFromUrl
 * } from './registry.d.mts'
 */
/** @import { RegistryURL } from './lib/types.d.ts' */

/** @type {typeof NormalizeRegistry} */
export function normalizeRegistry(url) {
	return /** @type {RegistryURL} */ (url.replace(/\/$/, ''));
}

/** @type {typeof ExtractRegistryFromUrl} */
export function extractRegistryFromUrl(resolved) {
	try {
		const url = new URL(resolved);

		// npm tarball URLs follow the pattern: {registry}/{package}/-/{package}-{version}.tgz
		// Find the /-/ separator which marks the start of the tarball path
		const tarballSeparatorIndex = url.pathname.indexOf('/-/');
		if (tarballSeparatorIndex !== -1) {
			// Everything before /-/ is the registry path plus the package name
			const pathBeforeTarball = url.pathname.slice(0, tarballSeparatorIndex);
			// Remove the package name from the end to get the registry path.
			// Package names can be scoped (@scope/pkg) or unscoped (pkg).
			const lastSlash = pathBeforeTarball.lastIndexOf('/');
			if (lastSlash !== -1) {
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

		// Fallback: just return protocol + host for http(s) URLs only.
		// Non-registry schemes (git+ssh, git+https, git, file, etc.) return null.
		if (url.protocol === 'https:' || url.protocol === 'http:') {
			return /** @type {RegistryURL} */ (`${url.protocol}//${url.host}`);
		}
		return null;
	} catch {
		return null;
	}
}
