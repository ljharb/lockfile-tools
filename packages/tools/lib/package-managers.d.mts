/**
 * Centralized definition of package managers and their lockfile configurations.
 * This provides precise literal types for lockfiles.
 *
 * IMPORTANT: This file must be kept in sync with package-managers.mjs
 * The lockfile strings must match exactly between this file and the .mjs file.
 * Mismatches will cause type errors when using the Lockfile type throughout the codebase.
 */

export const PACKAGE_MANAGERS: {
	readonly npm: {
		readonly lockfiles: readonly ['package-lock.json', 'npm-shrinkwrap.json'];
		readonly defaultLockfile: 'package-lock.json';
	};
	readonly yarn: {
		readonly lockfiles: readonly ['yarn.lock'];
		readonly defaultLockfile: 'yarn.lock';
	};
	readonly pnpm: {
		readonly lockfiles: readonly ['pnpm-lock.yaml'];
		readonly defaultLockfile: 'pnpm-lock.yaml';
	};
	readonly bun: {
		readonly lockfiles: readonly ['bun.lock', 'bun.lockb'];
		readonly defaultLockfile: 'bun.lock';
	};
	readonly vlt: {
		readonly lockfiles: readonly ['vlt-lock.json'];
		readonly defaultLockfile: 'vlt-lock.json';
	};
};

export type PackageManager = keyof typeof PACKAGE_MANAGERS;
export type Lockfile = typeof PACKAGE_MANAGERS[PackageManager]['lockfiles'][number];
export type LockfilesFor<PM extends PackageManager> = typeof PACKAGE_MANAGERS[PM]['lockfiles'][number];
