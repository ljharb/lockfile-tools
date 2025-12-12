/**
 * Lockfile format parsers for yarn and pnpm
 */

import { loadLockfileContent, getLockfileName } from './io.mjs';

/** @typedef {import('./lib/package-managers.d.mts').Lockfile} Lockfile */

/**
 * @typedef {Object} YarnLockfileEntry
 * @property {string} name - Package name
 * @property {string | null} resolved - Resolved URL
 * @property {string | null} integrity - Integrity hash
 * @property {Record<string, string | null>} [otherFields] - Additional parsed fields
 */

/**
 * Generic Yarn lockfile parser
 * @type {(content: string, fieldsToExtract?: string[]) => YarnLockfileEntry[]}
 */
export function parseYarnLockfile(content, fieldsToExtract = ['resolved', 'integrity']) {
	/** @type {YarnLockfileEntry[]} */
	const parsedEntries = [];
	const lines = content.split('\n');
	/** @type {string | null} */
	let currentPackage = null;
	/** @type {Record<string, string | null>} */
	let currentFields = {};

	lines.forEach((line) => {
		// New package entry
		if (line.match(/^[^#\s]/) && line.includes(':')) {
			// Save previous package if it exists
			if (currentPackage) {
				parsedEntries[parsedEntries.length] = {
					name: currentPackage,
					resolved: currentFields.resolved || null,
					integrity: currentFields.integrity || null,
					otherFields: currentFields,
				};
			}
			currentPackage = line.split(':')[0].trim().replace(/"/g, '');
			currentFields = {};
		}

		// Extract specified fields
		fieldsToExtract.forEach((field) => {
			const pattern = new RegExp(`^\\s+${field}\\s+"?([^"\\n]+)"?`);
			const match = line.match(pattern);
			if (match) {
				currentFields[field] = match[1].trim().replace(/"/g, '');
			}
		});
	});

	// Don't forget the last package
	if (currentPackage) {
		parsedEntries[parsedEntries.length] = {
			name: currentPackage,
			resolved: currentFields.resolved || null,
			integrity: currentFields.integrity || null,
			otherFields: currentFields,
		};
	}

	return parsedEntries;
}

/**
 * @typedef {Object} PnpmLockfileEntry
 * @property {string} name - Package name
 * @property {string | null} resolved - Resolved URL (tarball)
 * @property {string | null} integrity - Integrity hash
 * @property {Record<string, string | null>} [otherFields] - Additional parsed fields
 */

/**
 * Generic Pnpm lockfile parser
 * @type {(content: string, fieldsToExtract?: string[]) => PnpmLockfileEntry[]}
 */
export function parsePnpmLockfile(content, fieldsToExtract = ['tarball', 'integrity']) {
	/** @type {PnpmLockfileEntry[]} */
	const parsedEntries = [];
	const lines = content.split('\n');
	let inPackages = false;
	/** @type {string | null} */
	let currentPackage = null;
	/** @type {Record<string, string | null>} */
	let currentFields = {};

	lines.forEach((line) => {
		if (line.startsWith('packages:')) {
			inPackages = true;
			return;
		}

		if (inPackages) {
			// New package entry (2-space indent at start of line)
			if (line.match(/^ {2}\S/) && line.includes(':')) {
				// Save previous package if it exists
				if (currentPackage) {
					parsedEntries[parsedEntries.length] = {
						name: currentPackage,
						resolved: currentFields.tarball || null,
						integrity: currentFields.integrity || null,
						otherFields: currentFields,
					};
				}
				currentPackage = line.split(':')[0].trim().replace(/['"]/g, '');
				currentFields = {};
			}

			// Check for single-line resolution format: resolution: {tarball: ..., integrity: ...}
			const singleLineMatch = line.match(/^\s+resolution:\s+\{(.+)\}/);
			if (singleLineMatch) {
				const [, resolutionContent] = singleLineMatch;
				fieldsToExtract.forEach((field) => {
					const fieldPattern = new RegExp(`${field}:\\s*([^,}]+)`);
					const fieldMatch = resolutionContent.match(fieldPattern);
					if (fieldMatch) {
						currentFields[field] = fieldMatch[1].trim();
					}
				});
			}

			// Extract individual fields on separate lines
			fieldsToExtract.forEach((field) => {
				const pattern = new RegExp(`^\\s+${field}:\\s+(.+)$`);
				const match = line.match(pattern);
				if (match) {
					currentFields[field] = match[1].trim();
				}
			});
		}
	});

	// Don't forget the last package
	if (currentPackage) {
		parsedEntries[parsedEntries.length] = {
			name: currentPackage,
			resolved: currentFields.tarball || null,
			integrity: currentFields.integrity || null,
			otherFields: currentFields,
		};
	}

	return parsedEntries;
}

/**
 * Creates a lockfile extraction dispatcher that automatically handles different lockfile formats
 * @template T
 * @param {Object.<Lockfile, (content: string, ...args: unknown[]) => T>} extractors - Map of lockfile names to extractor functions
 * @param {((filepath: string, ...args: unknown[]) => T) | null} [bunLockbExtractor] - Special extractor for binary bun.lockb
 * @returns {(filepath: string, ...args: unknown[]) => T}
 */
export function createLockfileExtractor(extractors, bunLockbExtractor = null) {
	return function (filepath, ...args) {
		const filename = getLockfileName(filepath);

		// Handle binary bun.lockb format specially
		if (filename === 'bun.lockb' && bunLockbExtractor) {
			return bunLockbExtractor(filepath, ...args);
		}

		const content = loadLockfileContent(filepath);
		if (!content) {
			return /** @type {T} */ ([]);
		}

		const extractor = extractors[filename];
		/* c8 ignore next - defensive: unknown lockfile types not in extractors map */
		return extractor?.(content, ...args) || /** @type {T} */ ([]);
	};
}
