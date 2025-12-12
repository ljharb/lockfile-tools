/**
 * Helper to load packument fixtures for testing
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Load a packument from fixtures
 * @param {string} spec - Package spec like 'gulp@4.0.2'
 * @returns {object} Packument data
 */
export function loadPackument(spec) {
	const filename = `${spec.replace(/[@/]/g, '-').replace(/\.\./g, '-')}.json`;
	const filepath = join(__dirname, filename);
	const content = readFileSync(filepath, 'utf8');
	return JSON.parse(content);
}

/**
 * Create a mock pacote object that returns packuments from fixtures
 * @param {string[]} specs - Array of package specs to support
 * @returns {object} Mock pacote object
 */
export function createMockPacote(specs) {
	const packuments = /** @type {Record<string, { name: string; version: string; bin?: unknown }>} */ ({});

	for (const spec of specs) {
		const packument = /** @type {{ name: string; version: string; bin?: unknown }} */ (loadPackument(spec));
		packuments[spec] = packument;

		// Also support pnpm format (/package@version)
		const pnpmSpec = spec.replace(/^([^@]+)@/, '/$1@');
		packuments[pnpmSpec] = packument;
	}

	return {
		/** @param {string} spec */
		async manifest(spec) {
			const packument = packuments[spec];
			if (packument) {
				return packument;
			}
			// Simulate package not found
			const err = /** @type {Error & { code?: string }} */ (new Error(`404 Not Found - GET https://registry.npmjs.org/${spec}`));
			err.code = 'E404';
			throw err;
		},
	};
}
