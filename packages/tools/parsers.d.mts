import type { Lockfile } from './lib/package-managers.d.mts';

export interface YarnLockfileEntry {
	/** Package name */
	name: string;
	/** Resolved URL */
	resolved: string | null;
	/** Integrity hash */
	integrity: string | null;
	/** Line number where this entry starts (1-indexed) */
	line: number;
	/** Additional parsed fields */
	otherFields?: Record<string, string | null>;
}

export interface PnpmLockfileEntry {
	/** Package name */
	name: string;
	/** Resolved URL (tarball) */
	resolved: string | null;
	/** Integrity hash */
	integrity: string | null;
	/** Line number where this entry starts (1-indexed) */
	line: number;
	/** Additional parsed fields */
	otherFields?: Record<string, string | null>;
}

/** Parses a yarn lockfile, extracting `fieldsToExtract` (default `['resolved', 'integrity']`) into each entry. */
export function parseYarnLockfile(
	content: string,
	fieldsToExtract?: string[],
): YarnLockfileEntry[];

/** Parses the `packages:` section of a pnpm lockfile, extracting `fieldsToExtract` (default `['tarball', 'integrity']`). */
export function parsePnpmLockfile(
	content: string,
	fieldsToExtract?: string[],
): PnpmLockfileEntry[];

/**
 * Creates a lockfile-extraction dispatcher that handles each lockfile format,
 * with optional special handling for the binary `bun.lockb`.
 * @param extractors - Map of lockfile name to extractor function
 * @param bunLockbExtractor - Special extractor for the binary `bun.lockb`
 * @param getContent - Content loader; defaults to reading from disk
 * @param makeEmpty - Factory for the value returned when no content/extractor is available; defaults to an empty array
 */
export function createLockfileExtractor<T, A extends readonly unknown[] = []>(
	extractors: { [lockfile in Lockfile]?: (content: string, ...args: A) => T },
	bunLockbExtractor?: ((filepath: string, ...args: A) => T) | null,
	getContent?: (filepath: string) => string | null,
	makeEmpty?: () => T,
): (filepath: string, ...args: A) => T;
