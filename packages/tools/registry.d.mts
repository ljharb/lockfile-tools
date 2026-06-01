import type { RegistryURL } from './lib/types.d.ts';

/**
 * Normalizes a registry URL by removing trailing slashes.
 * @param url - Registry URL
 * @returns Normalized URL
 */
export function normalizeRegistry(url: string): RegistryURL;

/**
 * Extracts the registry URL from a resolved package URL. Handles standard
 * registries (e.g. `https://registry.npmjs.org`) and path-based registries
 * (e.g. `https://artifacts.example.com/api/npm/npm-repo`). Returns `null` for
 * non-registry schemes (git+ssh, git+https, file, etc.).
 * @param resolved - Resolved package URL (e.g. `https://registry.npmjs.org/pkg/-/pkg-1.0.0.tgz`)
 */
export function extractRegistryFromUrl(resolved: string): RegistryURL | null;
