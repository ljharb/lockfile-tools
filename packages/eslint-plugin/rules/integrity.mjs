/*
 *This rule ensures that every package includes an integrity value, and that that value is correct.
 *
 *"Correct" means the hashes are all in agreement between the package's package.json, the package's packument, the locally cached tarball, etc
 */

import { createHash } from 'crypto';
import { dirname, join } from 'path';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { homedir } from 'os';
import pacote from 'pacote';
import { PACKAGE_MANAGERS } from 'lockfile-tools/package-managers';
import { loadBunLockbContent, findJsonKeyLine } from 'lockfile-tools/io';
import { traverseDependencies } from 'lockfile-tools/npm';
import { parseYarnLockfile, parsePnpmLockfile, createLockfileExtractor } from 'lockfile-tools/parsers';

const { entries, values } = Object;
const { isArray } = Array;
const { parse } = JSON;

/** @typedef {import('lockfile-tools/lib/types.d.ts').PackageInfo} PackageInfo */
/** @typedef {import('lockfile-tools/lib/types.d.ts').RegistryURL} RegistryURL */
/** @typedef {import('lockfile-tools/lib/types.d.ts').LockfileDependenciesRecord} LockfileDependenciesRecord */
/** @typedef {import('lockfile-tools/lib/package-managers.d.mts').Lockfile} Lockfile */

/** @type {(content: string) => PackageInfo[]} */
function extractPackagesFromNpmLockfile(content) {
	/** @type {PackageInfo[]} */
	const packages = [];

	/** @type {{ packages?: { [k: string]: PackageInfo & { link?: boolean } }, dependencies?: { [k: string]: LockfileDependenciesRecord }}} */
	const parsed = parse(content);

	// Check packages
	if (parsed.packages) {
		entries(parsed.packages).forEach(([key, pkg]) => {
			if (key === '') { // Skip root package
				return;
			}
			// Skip workspace symlinks (link: true means it's a local workspace package)
			if (pkg.link) {
				return;
			}
			// Skip workspace package definitions (entries not in node_modules/)
			if (!key.startsWith('node_modules/')) {
				return;
			}
			packages[packages.length] = {
				name: key,
				integrity: pkg.integrity || null,
				resolved: pkg.resolved || null,
				line: findJsonKeyLine(content, key),
			};
		});
	}

	// Check dependencies (lockfile v1)
	if (parsed.dependencies) {
		traverseDependencies(parsed.dependencies, (fullName, dep) => {
			packages[packages.length] = {
				name: fullName,
				integrity: dep.integrity || null,
				resolved: dep.resolved || null,
				line: findJsonKeyLine(content, fullName),
			};
		});
	}

	return packages;
}

/** @type {(content: string) => PackageInfo[]} */
function extractPackagesFromYarnLockfile(content) {
	const parsedEntries = parseYarnLockfile(content, ['resolved', 'integrity']);
	return parsedEntries
		.filter(({ resolved }) => resolved)
		.map(({
			name,
			resolved,
			integrity,
			line,
		}) => ({
			name,
			resolved,
			integrity,
			line,
		}));
}

/** @type {(content: string) => PackageInfo[]} */
function extractPackagesFromPnpmLockfile(content) {
	const parsedEntries = parsePnpmLockfile(content, ['tarball', 'integrity']);
	return parsedEntries
		.filter(({ resolved }) => resolved)
		.map(({
			name,
			resolved,
			integrity,
			line,
		}) => ({
			name,
			resolved,
			integrity,
			line,
		}));
}

/** @type {(content: string) => PackageInfo[]} */
function extractPackagesFromBunLockfile(content) {
	/** @type {PackageInfo[]} */
	const packages = [];

	/** @type {{ packages: Record<string, [unknown, string, unknown, string]> }} */
	const parsed = parse(content);
	// Bun format: packages object with arrays [name@version, version, {}, integrity]
	if (parsed.packages) {
		entries(parsed.packages).forEach(([key, pkg]) => {
			if (isArray(pkg) && pkg.length >= 4) {
				const [nameAtVersion, version, , integrity] = pkg;
				// Extract package name from name@version format
				const atIndex = String(nameAtVersion).lastIndexOf('@');
				const pkgName = atIndex > 0 ? String(nameAtVersion).slice(0, atIndex) : String(nameAtVersion);
				packages[packages.length] = {
					name: key,
					integrity: integrity || null,
					resolved: /** @type {RegistryURL} */ (`https://registry.npmjs.org/${pkgName}/-/${pkgName}-${version}.tgz`),
					line: findJsonKeyLine(content, key),
				};
			}
		});
	}

	return packages;
}

/** @type {(filepath: string) => PackageInfo[]} */
function extractPackagesFromBunLockbBinary(filepath) {
	const yarnLockContent = loadBunLockbContent(filepath);
	if (!yarnLockContent) {
		return [];
	}
	return extractPackagesFromYarnLockfile(yarnLockContent);
}

/** @type {(content: string) => PackageInfo[]} */
function extractPackagesFromVltLockfile(content) {
	/** @type {PackageInfo[]} */
	const packages = [];

	/** @type {{ nodes: Record<string, [unknown, string, string]> }} */
	const parsed = parse(content);
	/*
	 * vlt format: nodes object with arrays [version_index, name, integrity]
	 * key format: "··package@version"
	 */
	if (parsed.nodes) {
		entries(parsed.nodes).forEach(([key, node]) => {
			if (isArray(node) && node.length >= 3) {
				const [, name, integrity] = node;
				// Extract version from key (format: "··package@version")
				const atIndex = key.lastIndexOf('@');
				const version = atIndex > 0 ? key.slice(atIndex + 1) : '';
				packages[packages.length] = {
					name: key,
					integrity: integrity || null,
					resolved: version
						? /** @type {RegistryURL} */ (`https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`)
						: null,
					line: findJsonKeyLine(content, key),
				};
			}
		});
	}

	return packages;
}

const extracts = /** @type {{ [k in Lockfile]: (s: string) => PackageInfo[] }} */ ({
	__proto__: null,
	'package-lock.json': extractPackagesFromNpmLockfile,
	'npm-shrinkwrap.json': extractPackagesFromNpmLockfile,
	'yarn.lock': extractPackagesFromYarnLockfile,
	'pnpm-lock.yaml': extractPackagesFromPnpmLockfile,
	'bun.lock': extractPackagesFromBunLockfile,
	'bun.lockb': extractPackagesFromBunLockfile,
	'vlt-lock.json': extractPackagesFromVltLockfile,
});

/** @type {(filepath: string) => PackageInfo[]} */
const extractPackagesFromLockfile = createLockfileExtractor(extracts, extractPackagesFromBunLockbBinary);

/**
 * Attempts to find and read a tarball from npm's cache using the resolved URL
 * npm's _cacache uses the URL as the cache key in the index, which points to the content
 * @type {(resolved: string) => Buffer | null}
 */
function findCachedTarballByUrl(resolved) {
	const npmCacheDir = join(homedir(), '.npm', '_cacache');
	if (!existsSync(npmCacheDir)) {
		return null;
	}

	/**
	 * Helper to look up a URL in the cache
	 * @type {(url: string) => Buffer | null}
	 */
	function lookupUrl(url) {
		try {
			const cacheKey = `make-fetch-happen:request-cache:${url}`;
			const urlHash = createHash('sha256').update(cacheKey).digest('hex');
			const indexDir = join(npmCacheDir, 'index-v5', urlHash.slice(0, 2), urlHash.slice(2, 4));

			if (existsSync(indexDir)) {
				const indexFiles = readdirSync(indexDir);
				for (let fi = 0; fi < indexFiles.length; fi++) {
					try {
						const indexPath = join(indexDir, indexFiles[fi]);
						const indexContent = readFileSync(indexPath, 'utf8');
						/*
						 * Cache index files contain newline-delimited entries
						 * Each line has format: <hash>\t<json>
						 */
						const lines = indexContent.split('\n').filter(Boolean);
						for (let li = 0; li < lines.length; li++) {
							const tabIndex = lines[li].indexOf('\t');
							if (tabIndex !== -1) {
								const jsonPart = lines[li].slice(tabIndex + 1);
								const indexEntry = parse(jsonPart);
								if (indexEntry.key === cacheKey) {
									// Found the index entry for this URL, now get the content
									const contentMatch = indexEntry.integrity.match(/^(sha\d+)-(.+)$/);
									if (contentMatch) {
										const [, contentAlgo, contentHash] = contentMatch;
										const buffer = Buffer.from(contentHash, 'base64');
										const hexHash = buffer.toString('hex');
										const cachedPath = join(
											npmCacheDir,
											'content-v2',
											contentAlgo,
											hexHash.slice(0, 2),
											hexHash.slice(2, 4),
											hexHash.slice(4),
										);
										if (existsSync(cachedPath)) {
											return readFileSync(cachedPath);
										}
									}
								}
							}
						}
					} catch {
						// Continue to next index file
					}
				}
			}
		} catch {
			// Index lookup failed
		}
		return null;
	}

	/*
	 * Try index-based cache using resolved URL
	 * npm indexes by URL: _cacache/index-v5/[hash of URL]
	 * npm prefixes tarball URLs with 'make-fetch-happen:request-cache:'
	 * Strip URL fragments (e.g., #hash) as they're not part of the HTTP request
	 */
	const [cleanUrl] = resolved.split('#');
	const result = lookupUrl(cleanUrl);
	if (result) {
		return result;
	}

	/*
	 * If the URL uses registry.yarnpkg.com, also try registry.npmjs.org
	 * Yarn's registry is just a CDN for npmjs.org, so packages have the same hashes
	 */
	if (cleanUrl.includes('registry.yarnpkg.com')) {
		const npmjsUrl = cleanUrl.replace('registry.yarnpkg.com', 'registry.npmjs.org');
		return lookupUrl(npmjsUrl);
	}

	return null;
}

/**
 * Computes integrity hash from tarball content
 * @type {(content: Buffer, algo: string) => string}
 */
function computeIntegrity(content, algo) {
	const hash = createHash(algo);
	hash.update(content);
	return `${algo}-${hash.digest('base64')}`;
}

/** @type {(p: PackageInfo) => p is PackageInfo & { resolved: RegistryURL }} */
function isRegistryURL({ resolved }) {
	return !!resolved && (/^https?:\/\//).test(resolved);
}

/**
 * Downloads a package tarball using pacote
 * Returns the tarball buffer if successful, or an error object if failed
 * @type {(resolvedUrl: string) => Promise<Buffer | { error: string }>}
 */
async function downloadTarball(resolvedUrl) {
	try {
		// pacote.tarball can fetch directly from a URL
		const tarball = await pacote.tarball(resolvedUrl, {
			// Use default npm cache location
			cache: join(homedir(), '.npm', '_cacache'),
		});
		return tarball;
	} catch (e) {
		return { error: e instanceof Error ? e.message : String(e) };
	}
}

/**
 * Verifies integrity of a tarball buffer against expected integrity hash
 * @type {(tarball: Buffer, integrity: string) => { valid: true } | { valid: false; actual: string }}
 */
function verifyIntegrityFromBuffer(tarball, integrity) {
	const match = integrity.match(/^(sha\d+)-/);
	/* istanbul ignore start - defensive: processPackage validates format before calling this function */
	if (!match) {
		return { valid: false, actual: '(invalid integrity format)' };
	}
	/* istanbul ignore stop */
	const [, algo] = match;

	const actualIntegrity = computeIntegrity(tarball, algo);
	if (actualIntegrity === integrity) {
		return { valid: true };
	}
	return { valid: false, actual: actualIntegrity };
}

/**
 * Gets a tarball buffer - first tries cache, then downloads
 * @type {(resolved: string) => Promise<Buffer | { error: string }>}
 */
async function getTarball(resolved) {
	// First try the cache
	const cached = findCachedTarballByUrl(resolved);
	if (cached) {
		return cached;
	}

	// Not in cache, download it
	return downloadTarball(resolved);
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
	meta: {
		type: 'problem',
		docs: {
			description: 'enforce integrity values in lockfiles',
			category: 'Possible Errors',
			recommended: true,
			url: 'https://github.com/ljharb/eslint-plugin-lockfile/blob/main/docs/rules/integrity.md',
		},
		schema: [
			{
				type: 'array',
				items: {
					type: 'string',
					enum: ['sha1', 'sha256', 'sha384', 'sha512'],
				},
				minItems: 1,
				uniqueItems: true,
			},
		],
		messages: {
			missingIntegrity: 'Package `{{name}}` in lockfile `{{filename}}` is missing an integrity value',
			missingResolved: 'Package `{{name}}` in lockfile `{{filename}}` is missing a resolved URL',
			invalidIntegrity: 'Package `{{name}}` in lockfile `{{filename}}` has an invalid integrity format',
			incorrectIntegrity: 'Package `{{name}}` in lockfile `{{filename}}` has an incorrect integrity hash (expected: {{expected}}, actual: {{actual}})',
			disallowedAlgorithm: 'Package `{{name}}` in lockfile `{{filename}}` uses disallowed hashing algorithm `{{algorithm}}` (allowed: {{allowed}})',
			downloadFailed: 'Package `{{name}}` in lockfile `{{filename}}` could not be downloaded to verify integrity: {{error}}',
			malformedLockfile: 'Lockfile "{{filename}}" is malformed: {{error}}',
		},
	},

	create(context) {
		const allowedAlgorithms = context.options[0] || ['sha1', 'sha256', 'sha384', 'sha512'];
		const lockfiles = /** @type {Lockfile[]} */ (
			values(PACKAGE_MANAGERS)
				.flatMap((pm) => pm.lockfiles)
		);

		/**
		 * Process a single package entry and report any issues
		 * @param {import('estree').Node} node
		 * @param {string} filename
		 * @param {PackageInfo & { resolved: RegistryURL }} pkg
		 */
		async function processPackage(node, filename, pkg) {
			const {
				integrity,
				name,
				resolved,
				line,
			} = pkg;

			/** @type {import('eslint').AST.SourceLocation | undefined} */
			const loc = line ? { start: { line, column: 0 }, end: { line, column: 0 } } : undefined;

			if (!integrity) {
				context.report({
					node,
					loc,
					messageId: 'missingIntegrity',
					data: { name, filename },
				});
				return;
			}

			// Validate format: integrity should be in format algo-base64hash
			const formatMatch = integrity.match(/^(sha1|sha256|sha384|sha512)-[A-Za-z0-9+/]+=*$/);
			if (!formatMatch) {
				context.report({
					node,
					loc,
					messageId: 'invalidIntegrity',
					data: { name, filename },
				});
				return;
			}

			const [, algorithm] = formatMatch;

			// Check if algorithm is allowed
			if (!allowedAlgorithms.includes(algorithm)) {
				context.report({
					node,
					loc,
					messageId: 'disallowedAlgorithm',
					data: {
						name,
						filename,
						algorithm,
						allowed: allowedAlgorithms.join(', '),
					},
				});
				return;
			}

			// Get the tarball (from cache or download)
			const tarball = await getTarball(resolved);

			if ('error' in tarball) {
				// Download failed - report the actual error
				context.report({
					node,
					loc,
					messageId: 'downloadFailed',
					data: {
						name,
						filename,
						error: tarball.error,
					},
				});
				return;
			}

			// Verify the integrity hash
			const result = verifyIntegrityFromBuffer(tarball, integrity);
			if (!result.valid) {
				context.report({
					node,
					loc,
					messageId: 'incorrectIntegrity',
					data: {
						name,
						filename,
						expected: integrity,
						actual: result.actual,
					},
				});
			}
		}

		/**
		 * Process a single lockfile and report any issues
		 * @param {import('estree').Node} node
		 * @param {string} dir
		 * @param {string} filename
		 * @returns {Promise<void>}
		 */
		function processLockfile(node, dir, filename) {
			/** @type {PackageInfo[]} */
			let packages;
			try {
				packages = extractPackagesFromLockfile(join(dir, filename));
			} catch (e) {
				// Malformed lockfile - report error
				context.report({
					node,
					messageId: 'malformedLockfile',
					data: {
						filename,
						error: e instanceof Error ? e.message : String(e),
					},
				});
				return Promise.resolve();
			}

			// Separate packages with and without resolved URLs
			const registryPackages = packages.filter(isRegistryURL);
			const unresolvedPackages = packages.filter((pkg) => !pkg.resolved);

			// Report errors for packages without resolved URL (missing both resolved and integrity)
			unresolvedPackages.forEach((pkg) => {
				/** @type {import('eslint').AST.SourceLocation | undefined} */
				const loc = pkg.line ? { start: { line: pkg.line, column: 0 }, end: { line: pkg.line, column: 0 } } : undefined;
				if (!pkg.integrity) {
					context.report({
						node,
						loc,
						messageId: 'missingIntegrity',
						data: { name: pkg.name, filename },
					});
				}
				context.report({
					node,
					loc,
					messageId: 'missingResolved',
					data: { name: pkg.name, filename },
				});
			});

			// Process all packages with registry URLs in parallel
			return Promise.all(registryPackages.map((pkg) => processPackage(node, filename, pkg))).then(() => {});
		}

		return {
			Program(node) {
				// Use context.filename if available (ESLint 8.40+), fall back to getFilename() for older versions
				const dir = dirname(context.filename ?? context.getFilename());

				// Return the combined promise for ESLint to wait on
				return Promise.all(lockfiles.map((filename) => processLockfile(node, dir, filename)));
			},
		};
	},
};
