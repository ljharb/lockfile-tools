/**
 * Represents a package entry with integrity and resolution information.
 * Used when extracting package data from lockfiles.
 */
export type PackageInfo = {
  name: string;
  integrity: string | null;
  resolved: string | null;
  line: number;
};

/**
 * Represents a dependency entry in npm v1 lockfile format.
 * This is used for recursive traversal of nested dependencies.
 */
export type LockfileDependencyEntry = {
  integrity?: string;
  resolved?: string;
  dependencies?: LockfileDependenciesRecord;
};

/** A record of dependency entries, keyed by package name. */
export type LockfileDependenciesRecord = Record<string, LockfileDependencyEntry>

export type RegistryURL = `http${'s' | ''}://${string}/`;
