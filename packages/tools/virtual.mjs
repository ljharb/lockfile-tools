/**
 * Utilities for generating virtual lockfiles using arborist when no physical lockfile exists
 */

import { existsSync } from 'fs';
import { join } from 'path';

import Arborist from '@npmcli/arborist';

import { PACKAGE_MANAGERS } from './lib/package-managers.mjs';

const { values } = Object;

/**
 * @typedef {Object} VirtualPackageInfo
 * @property {string} name - Package name
 * @property {string} version - Package version
 * @property {string | null} resolved - Resolved tarball URL
 * @property {string | null} integrity - Package integrity hash
 * @property {boolean} isDirect - Whether this is a direct dependency
 */

const lockfiles = values(PACKAGE_MANAGERS).flatMap((x) => x.lockfiles);

/**
 * Check if any lockfile exists in the directory
 * @type {(dir: string) => boolean}
 */
export function hasLockfile(dir) {
	return lockfiles.some((lockfile) => existsSync(join(dir, lockfile)));
}

/**
 * Build a virtual dependency tree using arborist and extract package information
 * @type {(dir: string) => Promise<VirtualPackageInfo[]>}
 */
export async function buildVirtualLockfile(dir) {
	/** @type {Set<string>} */
	const directDeps = new Set();

	const arb = new Arborist({ path: dir });
	try {
		const tree = await arb.loadVirtual();

		// Get direct dependencies from root
		if (tree.edgesOut) {
			for (const [name] of tree.edgesOut) {
				directDeps.add(name);
			}
		}

		return tree.inventory
			.values()
			.filter((x) => !x.isRoot)
			.map((node) => ({
				name: node.name || 'unknown',
				version: node.version || 'unknown',
				resolved: node.resolved || null,
				integrity: node.integrity || null,
				isDirect: directDeps.has(node.name || ''),
			}))
			.toArray();
	} catch {
	}
	// If arborist fails (e.g., no package.json), return empty array
	return [];
}
