#!/usr/bin/env node

import { writeFileSync, rmSync, existsSync, readdirSync, lstatSync } from 'fs';
import { randomUUID } from 'crypto';
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

/** @import { ESLint as ESLintNS, Linter } from 'eslint' */
/** @import { PackageManager as PM, Lockfile } from 'lockfile-tools/lib/package-managers.d.mts' */

const LOCKFILE_NAMES = values(PACKAGE_MANAGERS).flatMap((pm) => pm.lockfiles);

const PACKAGE_MANAGER_NAMES = keys(PACKAGE_MANAGERS);

/**
 * Determines the package manager flavor based on lockfile name
 * @param {Lockfile} lockfileName
 * @returns {PM | null}
 */
function getFlavorFromLockfile(lockfileName) {
	for (const [flavor, config] of entries(PACKAGE_MANAGERS)) {
		if (config.lockfiles.includes(lockfileName)) {
			return flavor;
		}
	}

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
 * @returns {Linter.RulesRecord}
 */
function configureRules(options, detectedFlavor) {
	// `recommended` is an array of file-scoped flat-config blocks; merge their
	// rules into a single record for the CLI's single lint pass. `tracked` reads
	// its directory from the linted file, so running it against the lockfile (or
	// the ESLint 8 temp file) evaluates the lockfile's directory and its sibling
	// `package.json` - no separate target needed.
	/** @type {Linter.RulesRecord} */
	const rules = Object.assign({}, ...plugin.configs.recommended.map((block) => block.rules));

	if (options.flavor && options.flavor.length > 0) {
		const flavor = options.flavor.length === 1 ? options.flavor[0] : options.flavor;
		rules['lockfile/flavor'] = ['error', flavor];
		// scope `tracked` to the same flavor so it checks the relevant lockfile
		rules['lockfile/tracked'] = ['error', flavor];
	} else if (detectedFlavor) {
		rules['lockfile/flavor'] = ['error', detectedFlavor];
		rules['lockfile/tracked'] = ['error', detectedFlavor];
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

	const lockfileName = /** @type {Lockfile} */ (basename(targetLockfile));
	const detectedFlavor = getFlavorFromLockfile(lockfileName);

	console.log(`Linting lockfile: ${lockfileName}`);
	console.log(`Directory: ${targetDir}`);

	let lintTarget = '';
	let tempFileCreated = false;

	try {
		const rules = configureRules(options, detectedFlavor);

		/** @type {ESLintNS.Options} */
		let eslintOptions;
		if (eslintMajorVersion >= 9) {
			// ESLint 9+ uses flat config
			lintTarget = targetLockfile;
			eslintOptions = {
				overrideConfigFile: true,
				overrideConfig: {
					files: LOCKFILE_NAMES.map((name) => `**/${name}`),
					plugins: { lockfile: plugin },
					languageOptions: {
						parser: {
							parse() {
								return {
									type: 'Program',
									body: [],
									sourceType: 'module',
									tokens: [],
									comments: [],
									loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
									range: [0, 0],
								};
							},
						},
					},
					rules,
				},
				cwd: targetDir,
			};
		} else {
			// ESLint 8 needs a real .js file to lint, and the rule uses
			// `dirname(context.filename)` to find the lockfile, so the temp
			// file has to live next to the lockfile. Use an unguessable name
			// and the `wx` flag so writeFileSync fails atomically if anything
			// already exists at that path (including an attacker-planted
			// symlink), removing the prior existsSync/writeFileSync race.
			lintTarget = join(targetDir, `eslint-lockfile-check.${randomUUID()}.js`);
			writeFileSync(lintTarget, '// Temporary file for eslint-plugin-lockfile\n', { flag: 'wx' });
			tempFileCreated = true;

			eslintOptions = /** @type {ESLintNS.Options} */ ({
				useEslintrc: false,
				plugins: { lockfile: plugin },
				overrideConfig: /** @type {Linter.LegacyConfig} */ ({
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

		const results = await eslint.lintFiles([lintTarget]);

		if (eslintMajorVersion < 9) {
			for (const result of results) {
				result.filePath = targetLockfile;
			}
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
		if (tempFileCreated) {
			// lstat (no symlink-follow) so we never unlink through a symlink
			// that was swapped in after our writeFileSync.
			try {
				if (lstatSync(lintTarget).isFile()) {
					rmSync(lintTarget);
				}
			} catch { /* file missing == fine */ }
		}
	}
}

const {
	help,
	positionals: [positional],
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

const VALID_ALGORITHMS = /** @type {const} */ (['sha1', 'sha256', 'sha384', 'sha512']);

// Validate flavor values
if (cliValues.flavor) {
	for (const f of cliValues.flavor) {
		if (!PACKAGE_MANAGER_NAMES.includes(f)) {
			errors[errors.length] = `Invalid flavor: ${f} (valid: ${PACKAGE_MANAGER_NAMES.join(', ')})`;
		}
	}
}

if (cliValues.registry) {
	for (const reg of cliValues.registry) {
		if (!(/^https?:\/\//).test(reg)) {
			errors[errors.length] = `Invalid registry URL: ${reg} (must start with http:// or https://)`;
		}
	}
}

if (cliValues.algorithms) {
	for (const alg of cliValues.algorithms) {
		if (!VALID_ALGORITHMS.includes(alg)) {
			errors[errors.length] = `Invalid algorithm: ${alg} (valid: ${VALID_ALGORITHMS.join(', ')})`;
		}
	}
}

await help();

const exitCode = await lintLockfile(positional, {
	flavor: cliValues.flavor,
	registry: cliValues.registry,
	algorithms: cliValues.algorithms,
});

process.exit(exitCode);
