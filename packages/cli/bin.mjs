#!/usr/bin/env node

import { writeFileSync, rmSync, existsSync, readdirSync } from 'fs';
import { join, resolve, dirname, basename } from 'path';
import { ESLint } from 'eslint';
import pargs from 'pargs';
import plugin from 'eslint-plugin-lockfile';
import { PACKAGE_MANAGERS } from 'lockfile-tools/package-managers';

// Detect ESLint major version for compatibility
const eslintMajorVersion = parseInt(ESLint.version.split('.')[0], 10);

const {
	entries,
	keys,
	values,
} = Object;

/** @typedef {import('lockfile-tools/lib/package-managers.d.mts').PackageManager} PM */

/** @type {string[]} */
const LOCKFILE_NAMES = values(PACKAGE_MANAGERS).flatMap((pm) => pm.lockfiles);

/** @type {PM[]} */
const PACKAGE_MANAGER_NAMES = /** @type {PM[]} */ (keys(PACKAGE_MANAGERS));

/**
 * Determines the package manager flavor based on lockfile name
 * @param {string} lockfileName
 * @returns {PM | null}
 */
function getFlavorFromLockfile(lockfileName) {
	for (const [flavor, config] of entries(PACKAGE_MANAGERS)) {
		if (/** @type {readonly string[]} */ (config.lockfiles).includes(lockfileName)) {
			return /** @type {PM} */ (flavor);
		}
	}
	/* istanbul ignore next - defensive: CLI only processes known lockfile names */
	return null;
}

/**
 * Resolves the target lockfile and directory
 * @param {string | undefined} lockfilePath
 * @returns {{ targetLockfile: string, targetDir: string } | { error: string }}
 */
function resolveTarget(lockfilePath) {
	if (lockfilePath) {
		const targetLockfile = resolve(lockfilePath);
		if (!existsSync(targetLockfile)) {
			return { error: `Error: Lockfile not found: ${targetLockfile}` };
		}
		return { targetLockfile, targetDir: dirname(targetLockfile) };
	}

	const targetDir = process.cwd();
	const files = readdirSync(targetDir);
	const foundLockfiles = files.filter((f) => LOCKFILE_NAMES.includes(f));

	if (foundLockfiles.length === 0) {
		return { error: `Error: No lockfile found in ${targetDir}` };
	}

	return { targetLockfile: join(targetDir, foundLockfiles[0]), targetDir };
}

/**
 * Configures ESLint rules based on options
 * @param {{ flavor?: string[], registry?: string[], algorithms?: string[] }} options
 * @param {PM | null} detectedFlavor
 * @returns {import('eslint').Linter.RulesRecord}
 */
function configureRules(options, detectedFlavor) {
	/** @type {import('eslint').Linter.RulesRecord} */
	const rules = { ...plugin.configs.recommended.rules };

	if (options.flavor && options.flavor.length > 0) {
		rules['lockfile/flavor'] = ['error', options.flavor.length === 1 ? options.flavor[0] : options.flavor];
	} else if (detectedFlavor) {
		rules['lockfile/flavor'] = ['error', detectedFlavor];
	}

	if (options.registry && options.registry.length > 0) {
		rules['lockfile/registry'] = ['error', options.registry.length === 1 ? options.registry[0] : options.registry];
	}

	if (options.algorithms && options.algorithms.length > 0) {
		rules['lockfile/integrity'] = ['error', options.algorithms];
	}

	return rules;
}

/**
 * @param {string | undefined} lockfilePath
 * @param {{ flavor?: string[], registry?: string[], algorithms?: string[] }} options
 */
export async function lintLockfile(lockfilePath, options = {}) {
	const resolved = resolveTarget(lockfilePath);
	if ('error' in resolved) {
		console.error(resolved.error);
		return 1;
	}
	const { targetLockfile, targetDir } = resolved;

	const lockfileName = basename(targetLockfile);
	const detectedFlavor = getFlavorFromLockfile(lockfileName);

	console.log(`Linting lockfile: ${lockfileName}`);
	console.log(`Directory: ${targetDir}`);

	const tempFile = join(targetDir, 'eslint-lockfile-check.js');
	const tempFileCreated = !existsSync(tempFile);

	if (tempFileCreated) {
		writeFileSync(tempFile, '// Temporary file for eslint-plugin-lockfile\n');
	}

	try {
		const rules = configureRules(options, detectedFlavor);

		/** @type {import('eslint').ESLint.Options} */
		let eslintOptions;
		if (eslintMajorVersion >= 9) {
			// ESLint 9+ uses flat config
			eslintOptions = {
				overrideConfigFile: true,
				overrideConfig: {
					files: ['**/*.js'],
					plugins: { lockfile: plugin },
					rules,
				},
				cwd: targetDir,
			};
		} else {
			// ESLint 8 uses legacy config
			eslintOptions = /** @type {import('eslint').ESLint.Options} */ ({
				useEslintrc: false,
				plugins: { lockfile: plugin },
				overrideConfig: /** @type {import('eslint').Linter.LegacyConfig} */ ({
					plugins: ['lockfile'],
					parserOptions: {
						ecmaVersion: 2022,
					},
					rules,
				}),
				cwd: targetDir,
			});
		}

		const eslint = new ESLint(eslintOptions);

		const results = await eslint.lintFiles([tempFile]);

		for (const result of results) {
			result.filePath = targetLockfile;
		}

		const formatter = await eslint.loadFormatter('stylish');
		const resultText = await formatter.format(results);

		const errorCount = results.reduce((sum, r) => sum + r.errorCount, 0);
		const warningCount = results.reduce((sum, r) => sum + r.warningCount, 0);

		if (resultText.trim()) {
			console.log(resultText);
		}

		if (errorCount === 0 && warningCount === 0) {
			console.log('✓ No lockfile issues found');
			return 0;
		}

		if (errorCount > 0) {
			console.error(`\n✗ Found ${errorCount} error(s) and ${warningCount} warning(s)`);
			return 1;
		}

		console.log(`\n⚠ Found ${warningCount} warning(s)`);
		return 0;
	} catch (error) {
		console.error('Error linting lockfile:', /** @type {Error} */ (error).message);
		return 1;
	} finally {
		if (tempFileCreated && existsSync(tempFile)) {
			rmSync(tempFile);
		}
	}
}

const {
	help,
	positionals,
	values: cliValues,
	errors,
} = await pargs(import.meta.filename, {
	options: {
		flavor: {
			type: 'string',
			short: 'f',
			multiple: true,
		},
		registry: {
			type: 'string',
			short: 'r',
			multiple: true,
		},
		algorithms: {
			type: 'string',
			short: 'a',
			multiple: true,
		},
	},
	allowPositionals: 1,
});

const VALID_ALGORITHMS = ['sha1', 'sha256', 'sha384', 'sha512'];

/** @type {(arr: unknown) => string[] | undefined} */
const toStringArray = (arr) => (Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : undefined);

const flavorValues = toStringArray(cliValues.flavor);
const registryValues = toStringArray(cliValues.registry);
const algorithmsValues = toStringArray(cliValues.algorithms);

// Validate flavor values
if (flavorValues) {
	for (const f of flavorValues) {
		if (!PACKAGE_MANAGER_NAMES.includes(/** @type {PM} */ (f))) {
			errors.push(`Invalid flavor: ${f} (valid: ${PACKAGE_MANAGER_NAMES.join(', ')})`);
		}
	}
}

// Validate registry URLs
if (registryValues) {
	for (const reg of registryValues) {
		if (!(/^https?:\/\//).test(reg)) {
			errors.push(`Invalid registry URL: ${reg} (must start with http:// or https://)`);
		}
	}
}

// Validate algorithms
if (algorithmsValues) {
	for (const alg of algorithmsValues) {
		if (!VALID_ALGORITHMS.includes(alg)) {
			errors.push(`Invalid algorithm: ${alg} (valid: ${VALID_ALGORITHMS.join(', ')})`);
		}
	}
}

await help();

const exitCode = await lintLockfile(positionals[0], {
	flavor: flavorValues,
	registry: registryValues,
	algorithms: algorithmsValues,
});

process.exit(exitCode);
