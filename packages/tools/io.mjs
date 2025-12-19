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

/**
 * Finds the line number of a JSON key in content
 * @param {string} content - The file content
 * @param {string} key - The key to find (e.g., "node_modules/tape")
 * @returns {number} - Line number (1-indexed), or 0 if not found
 */
export function findJsonKeyLine(content, key) {
	const lines = content.split('\n');
	// Escape special regex characters in the key
	const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	// Match the key as a JSON property (with quotes)
	const pattern = new RegExp(`^\\s*"${escapedKey}"\\s*:`);

	for (let i = 0; i < lines.length; i++) {
		if (pattern.test(lines[i])) {
			return i + 1; // 1-indexed
		}
	}
	return 0; // Not found
}
