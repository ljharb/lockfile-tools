import type {
    Lockfile,
    LockfilesFor,
    PackageManager,
} from './lib/package-managers.d.mts';

/** Reads a file's UTF-8 contents, or `null` if it cannot be read. */
export function loadLockfileContent(filepath: string): string | null;

/** Reads and decodes a binary `bun.lockb` to its yarn-style text, or `null`. */
export function loadBunLockbContent(filepath: string): string | null;

/** The lockfile basename of a path, typed as the lockfile literal. */
export function getLockfileName<
    P extends PackageManager = PackageManager,
>(filepath: string): LockfilesFor<P>;

/**
 * Finds the 1-indexed line of a JSON key in `content`, or 0 if not found.
 * @param content - The file content
 * @param key - The key to find (e.g. `node_modules/tape`)
 */
export function findJsonKeyLine(content: string, key: string): number;
