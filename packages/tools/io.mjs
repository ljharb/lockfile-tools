/**
 * File I/O operations for lockfiles
 */

import { readFileSync, existsSync } from 'fs';
import { basename } from 'path';
import { parse as parseBunLockb } from '@hyrious/bun.lockb';

/** @typedef {import('./lib/package-managers.d.mts').PackageManager} PM */
/** @typedef {import('./lib/package-managers.d.mts').Lockfile} Lockfile */

/** @type {(filepath: string) => string | null} */
export function loadLockfileContent(filepath) {
	try {
		return readFileSync(filepath, 'utf8');
	} catch {
		return null;
	}
}

/** @type {(filepath: string) => string | null} */
export function loadBunLockbContent(filepath) {
	if (!existsSync(filepath)) {
		return null;
	}
	const buffer = readFileSync(filepath);
	return parseBunLockb(buffer);
}

/** @type {<P extends PM = PM>(filepath: string) => import('./lib/package-managers.d.mts').LockfilesFor<P>} */
export function getLockfileName(filepath) {
	return /** @type {Lockfile} */ (basename(filepath));
}
