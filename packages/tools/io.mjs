/**
 * File I/O operations for lockfiles
 */

import { readFileSync, existsSync } from 'fs';
import { basename } from 'path';
import { parse as parseBunLockb } from '@hyrious/bun.lockb';

/**
 * @import {
 *	loadLockfileContent as LoadLockfileContent,
 *	loadBunLockbContent as LoadBunLockbContent,
 *	getLockfileName as GetLockfileName,
 *	findJsonKeyLine as FindJsonKeyLine,
 * } from './io.d.mts' */
/** @import { Lockfile } from './lib/package-managers.d.mts' */

/** @type {typeof LoadLockfileContent} */
export function loadLockfileContent(filepath) {
	try {
		return readFileSync(filepath, 'utf8');
	} catch {
		return null;
	}
}

/** @type {typeof LoadBunLockbContent} */
export function loadBunLockbContent(filepath) {
	if (!existsSync(filepath)) {
		return null;
	}
	const buffer = readFileSync(filepath);
	return parseBunLockb(buffer);
}

/** @type {typeof GetLockfileName} */
export function getLockfileName(filepath) {
	return /** @type {Lockfile} */ (basename(filepath));
}

/** @type {typeof FindJsonKeyLine} */
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
