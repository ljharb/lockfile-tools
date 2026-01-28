/*
This rule ensures that the lockfile version is as configured.

It must be configured per package manager, via an object where each key is a package manager
(the same list of package managers in the "flavor" rule)
Each value is a lockfile version that is valid for that package manager.

For npm, it can be absent, 1, 2, or 3. Default is 3.
I don't know off the top of my head what the other package managers have for version options, but the default for each one should be the latest one.
 */

import { dirname, join } from 'path';
import { PACKAGE_MANAGERS } from 'lockfile-tools/package-managers';
import { loadLockfileContent, loadBunLockbContent } from 'lockfile-tools/io';

/** @typedef {import('lockfile-tools/lib/package-managers.d.mts').PackageManager} PackageManager */
/** @typedef {import('lockfile-tools/lib/package-managers.d.mts').Lockfile} Lockfile */

/** @type {{ [K in PackageManager]: { files: readonly Lockfile[], validVersions: readonly string[] | readonly number[], defaultVersion: string | number } }} */
const LOCKFILE_VERSIONS = /** @const @type {const} */ ({
	npm: {
		files: PACKAGE_MANAGERS.npm.lockfiles,
		validVersions: [1, 2, 3],
		defaultVersion: 3,
	},
	yarn: {
		files: PACKAGE_MANAGERS.yarn.lockfiles,
		validVersions: [1, 2],
		defaultVersion: 2,
	},
	pnpm: {
		files: PACKAGE_MANAGERS.pnpm.lockfiles,
		validVersions: ['5.3', '5.4', '6.0', '6.1', '7.0', '9.0'],
		defaultVersion: '9.0',
	},
	bun: {
		files: PACKAGE_MANAGERS.bun.lockfiles,
		validVersions: [0, 1],
		defaultVersion: 1,
	},
	vlt: {
		files: PACKAGE_MANAGERS.vlt.lockfiles,
		validVersions: [0],
		defaultVersion: 0,
	},
});

/** @type {(filepath: string, manager: PackageManager) => null | (typeof LOCKFILE_VERSIONS[manager])['validVersions'][number]} */
function getLockfileVersion(filepath, manager) {
	// bun.lockb is binary format - handle before loading as text
	if (manager === 'bun' && (/\.lockb$/).test(filepath)) {
		const yarnLockContent = loadBunLockbContent(filepath);
		if (!yarnLockContent) {
			return null;
		}
		// Check for yarn lockfile v1 header which indicates version 0
		if (yarnLockContent.includes('# yarn lockfile v1')) {
			return 0;
		}
		return null;
	}
	const content = loadLockfileContent(filepath);
	if (!content) {
		return null;
	}

	if (manager === 'npm') {
		const parsed = JSON.parse(content);
		return parsed.lockfileVersion;
	}

	if (manager === 'yarn') {
		const [firstLine] = content.split('\n', 2);
		if (firstLine.includes('# yarn lockfile v1')) {
			return 1;
		}
		if (firstLine.includes('__metadata:')) {
			return 2;
		}
		return null;
	}

	if (manager === 'pnpm') {
		const match = content.match(/^lockfileVersion:\s*['"]?([^'":\n]+)['"]?/m);
		return match ? match[1] : null;
	}

	if (manager === 'bun') {
		// bun.lock is JSON with lockfileVersion
		const parsed = JSON.parse(content);
		return parsed.lockfileVersion || 0;
	}

	if (manager === 'vlt') {
		const parsed = JSON.parse(content);
		return parsed.lockfileVersion || 0;
	}
	/* istanbul ignore next - all known managers are handled above */
	throw new SyntaxError('should never reach here');
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
	meta: {
		type: 'problem',
		docs: {
			description: 'enforce lockfile version',
			category: 'Possible Errors',
			recommended: true,
			url: 'https://github.com/ljharb/eslint-plugin-lockfile/blob/main/docs/rules/version.md',
		},
		schema: [
			{
				type: 'object',
				properties: {
					npm: {
						oneOf: [
							{ type: 'null' },
							{ type: 'number', enum: LOCKFILE_VERSIONS.npm.validVersions },
							{
								type: 'array',
								items: { type: 'number', enum: LOCKFILE_VERSIONS.npm.validVersions },
								minItems: 1,
								uniqueItems: true,
							},
						],
					},
					yarn: {
						oneOf: [
							{ type: 'null' },
							{
								type: 'number',
								enum: LOCKFILE_VERSIONS.yarn.validVersions,
							},
							{
								type: 'array',
								items: { type: 'number', enum: LOCKFILE_VERSIONS.yarn.validVersions },
								minItems: 1,
								uniqueItems: true,
							},
						],
					},
					pnpm: {
						oneOf: [
							{ type: 'null' },
							{
								type: 'string',
								enum: LOCKFILE_VERSIONS.pnpm.validVersions,
							},
							{
								type: 'array',
								items: { type: 'string', enum: LOCKFILE_VERSIONS.pnpm.validVersions },
								minItems: 1,
								uniqueItems: true,
							},
						],
					},
					bun: {
						oneOf: [
							{ type: 'null' },
							{
								type: 'number',
								enum: LOCKFILE_VERSIONS.bun.validVersions,
							},
							{
								type: 'array',
								items: { type: 'number', enum: LOCKFILE_VERSIONS.bun.validVersions },
								minItems: 1,
								uniqueItems: true,
							},
						],
					},
					vlt: {
						oneOf: [
							{ type: 'null' },
							{
								type: 'number',
								enum: LOCKFILE_VERSIONS.vlt.validVersions,
							},
							{
								type: 'array',
								items: { type: 'number', enum: LOCKFILE_VERSIONS.vlt.validVersions },
								minItems: 1,
								uniqueItems: true,
							},
						],
					},
				},
				additionalProperties: false,
			},
		],
		messages: {
			wrongVersion: 'Lockfile `{{filename}}` has version {{actual}} but expected {{expected}}',
			noVersion: 'Lockfile `{{filename}}` has no version',
			cannotRead: 'Cannot read lockfile `{{filename}}`',
			malformedLockfile: 'Lockfile `{{filename}}` is malformed: {{error}}',
		},
	},

	create(context) {
		const config = context.options[0] || {};
		/** @type {{ [k in PackageManager]: typeof LOCKFILE_VERSIONS[k]['defaultVersion'] }} */
		const expectedVersions = {
			// @ts-expect-error TS doesn't understand dunder proto
			__proto__: null,
			npm: config.npm !== undefined ? config.npm : LOCKFILE_VERSIONS.npm.defaultVersion,
			yarn: config.yarn !== undefined ? config.yarn : LOCKFILE_VERSIONS.yarn.defaultVersion,
			pnpm: config.pnpm !== undefined ? config.pnpm : LOCKFILE_VERSIONS.pnpm.defaultVersion,
			bun: config.bun !== undefined ? config.bun : LOCKFILE_VERSIONS.bun.defaultVersion,
			vlt: config.vlt !== undefined ? config.vlt : LOCKFILE_VERSIONS.vlt.defaultVersion,
		};

		return {
			Program(node) {
				const filename = context.getFilename();
				const dir = dirname(filename);

				// Check all lockfiles
				Object.entries(LOCKFILE_VERSIONS).forEach(([manager, versionConfig]) => {
					const typedManager = /** @type {PackageManager} */ (manager);
					versionConfig.files.forEach((lockfileName) => {
						const lockfilePath = join(dir, lockfileName);

						/** @type {string | number | null} */
						let version;
						try {
							version = getLockfileVersion(lockfilePath, typedManager);
						} catch (e) {
							// Malformed lockfile - report error
							context.report({
								node,
								messageId: 'malformedLockfile',
								data: {
									filename: lockfileName,
									error: e instanceof Error ? e.message : String(e),
								},
							});
							return;
						}

						if (version == null) {
							return; // File doesn't exist or couldn't be read
						}

						const expectedVersion = expectedVersions[typedManager];

						if (expectedVersion != null) {
							// expectedVersion can be a single value or an array
							const allowedVersions = Array.isArray(expectedVersion) ? expectedVersion : [expectedVersion];
							if (!allowedVersions.includes(version)) {
								context.report({
									node,
									messageId: 'wrongVersion',
									data: {
										filename: lockfileName,
										actual: String(version),
										expected: allowedVersions.map(String).join(' or '),
									},
								});
							}
						}
					});
				});
			},
		};
	},
};
