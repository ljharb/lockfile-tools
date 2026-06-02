/**
 * Lockfile format parsers for yarn and pnpm
 */

import { loadLockfileContent, getLockfileName } from './io.mjs';

/**
 * @import {
 * 	parseYarnLockfile as ParseYarnLockfile,
 * 	parsePnpmLockfile as ParsePnpmLockfile,
 * 	YarnLockfileEntry,
 * 	PnpmLockfileEntry,
 * } from './parsers.d.mts'
 */
/** @import { Lockfile } from './lib/package-managers.d.mts' */

/** @type {typeof ParseYarnLockfile} */
export function parseYarnLockfile(content, fieldsToExtract = ['resolved', 'integrity']) {
	/** @type {YarnLockfileEntry[]} */
	const parsedEntries = [];
	const lines = content.split('\n');
	/** @type {string | null} */
	let currentPackage = null;
	/** @type {number} */
	let currentPackageLine = 0;
	/** @type {Record<string, string | null>} */
	let currentFields = {};

	lines.forEach((line, index) => {
		const lineNumber = index + 1; // 1-indexed
		// New package entry
		if (line.match(/^[^#\s]/) && line.includes(':')) {
			// Save previous package if it exists
			if (currentPackage) {
				parsedEntries[parsedEntries.length] = {
					name: currentPackage,
					resolved: currentFields.resolved || null,
					integrity: currentFields.integrity || null,
					line: currentPackageLine,
					otherFields: currentFields,
				};
			}
			currentPackage = line.split(':')[0].trim().replace(/"/g, '');
			currentPackageLine = lineNumber;
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
			line: currentPackageLine,
			otherFields: currentFields,
		};
	}

	return parsedEntries;
}

/** @type {typeof ParsePnpmLockfile} */
export function parsePnpmLockfile(content, fieldsToExtract = ['tarball', 'integrity']) {
	/** @type {PnpmLockfileEntry[]} */
	const parsedEntries = [];
	const lines = content.split('\n');
	let inPackages = false;
	/** @type {string | null} */
	let currentPackage = null;
	/** @type {number} */
	let currentPackageLine = 0;
	/** @type {Record<string, string | null>} */
	let currentFields = {};

	lines.forEach((line, index) => {
		const lineNumber = index + 1; // 1-indexed
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
						/* istanbul ignore next - both branches tested but coverage tool reports incorrectly */
						resolved: currentFields.tarball || null,
						integrity: currentFields.integrity || null,
						line: currentPackageLine,
						otherFields: currentFields,
					};
				}
				currentPackage = line.split(':')[0].trim().replace(/['"]/g, '');
				currentPackageLine = lineNumber;
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
			/* istanbul ignore next - both branches tested but coverage tool reports incorrectly */
			resolved: currentFields.tarball || null,
			integrity: currentFields.integrity || null,
			line: currentPackageLine,
			otherFields: currentFields,
		};
	}

	return parsedEntries;
}

/*
 * `createLockfileExtractor` is generic and its body needs to refer to the type
 * parameter `T` (in the `makeEmpty` default), which can't be named under the
 * `@type`-binding pattern, so it stays a generic `function` whose JSDoc mirrors
 * the declaration in `parsers.d.mts` (keep the two in sync).
 */
/**
 * @template T
 * @template {readonly unknown[]} [A=[]]
 * @param {{ [lockfile in Lockfile]?: (content: string, ...args: A) => T }} extractors - Map of lockfile names to extractor functions
 * @param {((filepath: string, ...args: A) => T) | null} [bunLockbExtractor] - Special extractor for binary bun.lockb
 * @param {(filepath: string) => string | null} [getContent] - Optional content loader; defaults to reading from disk
 * @param {() => T} [makeEmpty] - Factory for the value returned when no content / no extractor is available; defaults to an empty array (back-compat).
 * @returns {(filepath: string, ...args: A) => T}
 */
export function createLockfileExtractor(
	extractors,
	bunLockbExtractor = null,
	getContent = loadLockfileContent,
	makeEmpty = /** @type {() => T} */ (() => []),
) {
	return function (filepath, ...args) {
		const filename = getLockfileName(filepath);

		// Handle binary bun.lockb format specially
		if (filename === 'bun.lockb' && bunLockbExtractor) {
			return bunLockbExtractor(filepath, ...args);
		}

		const content = getContent(filepath);
		if (!content) {
			return makeEmpty();
		}

		const extractor = extractors[filename];
		/* istanbul ignore next - defensive: unknown lockfile types not in extractors map */
		return extractor?.(content, ...args) || makeEmpty();
	};
}
