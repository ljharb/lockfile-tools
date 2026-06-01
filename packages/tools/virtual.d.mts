/** Information about a package extracted from a virtual (arborist-built) lockfile. */
export interface VirtualPackageInfo {
	/** Package name */
	name: string;
	/** Package version */
	version: string;
	/** Resolved tarball URL */
	resolved: string | null;
	/** Package integrity hash */
	integrity: string | null;
	/** Whether this is a direct dependency */
	isDirect: boolean;
}

/** Whether any known lockfile exists in `dir`. */
export function hasLockfile(dir: string): boolean;

/**
 * Builds a virtual dependency tree via arborist and extracts package info.
 * Resolves to `[]` if arborist fails (e.g. there is no `package.json`).
 */
export function buildVirtualLockfile(dir: string): Promise<VirtualPackageInfo[]>;
