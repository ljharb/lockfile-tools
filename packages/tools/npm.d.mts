import type { MemberNode, ValueNode } from '@humanwhocodes/momoa';
import type {
	LockfileDependencyEntry,
	LockfileDependenciesRecord,
} from './lib/types.d.ts';

/**
 * Recursively traverses an npm v1 `dependencies` record (plain object),
 * invoking `callback` with each dependency's joined `parent/child` name.
 * @param prefix - Current path prefix for nested dependencies
 */
export function traverseDependencies(
	deps: LockfileDependenciesRecord,
	callback: (name: string, dep: LockfileDependencyEntry) => void,
	prefix?: string,
): void;

/**
 * Recursively traverses an npm v1 `dependencies` object as a momoa AST. Each
 * callback receives the dependency Member node (so the caller can inspect its
 * source line and walk its value) and the joined `parent/child` full name.
 */
export function traverseDependenciesAST(
	depsObj: ValueNode | null | undefined,
	callback: (member: MemberNode, fullName: string) => void,
	prefix?: string,
): void;

/**
 * Iterates the `packages` object of an npm v2/v3 lockfile (a momoa AST),
 * skipping the root entry and workspace symlinks. Yields each package Member
 * node with its lockfile key (e.g. `node_modules/@scope/pkg`).
 */
export function forEachNpmPackagesMember(
	packagesObj: ValueNode | null | undefined,
	callback: (member: MemberNode, key: string) => void,
): void;

/** Extracts a package name from a lockfile key or dependency name. */
export function extractPackageName(key: string): string;
