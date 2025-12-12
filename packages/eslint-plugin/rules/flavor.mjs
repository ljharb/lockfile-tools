/*
 	this rule allows the user to configure which lockfile formats are permitted
 	this includes:
 		- npm-shrinkwrap.json
 		- package-lock.json
 		- yarn.lock
 		- bun.lock
 		- bun.lockb
 		- vlt.lock

 	configuration allows either a string, or an array of strings (package manager names, eg "npm", "yarn", etc) and/or objects
 	the object has a "name" property which is the name referred to previously,
 	and a "files" property that can either be `true` (all lockfiles from that package manager allowed)
 	or an array of strings (valid lockfile names for that package manager)

 	The eslint schema should enforce that only valid values are present.

 	The default is just "npm". The default lockfile names for each manager are:
 	 - npm: package-lock.json
 	 - yarn: yarn.lock
 	 - bun: bun.lock
 	 - vlt: vlt.lock
 	 - pnpm: pnpm-lock.yaml

 	Note that if the package manager configuration is already set to not produce/update a given lockfile variant, then the default should be to disallow it.

 	For example, npm does not produce `npm-shrinkwrap.json` by default, but if npm is configured to do so, it should be permitted.
 	It does produce `package-lock.json` by default, but if npm is configured not to do so, it should not permit it by default.
*/

import { readdirSync } from 'fs';
import { dirname } from 'path';
import { PACKAGE_MANAGERS } from 'lockfile-tools/package-managers';

const { from } = Array;
const { keys, values } = Object;

/** @typedef {import('lockfile-tools/lib/package-managers.d.mts').PackageManager} PM */
/** @typedef {import('lockfile-tools/lib/package-managers.d.mts').Lockfile} Lockfile */
/** @typedef {{ name: PM, files: true | string[] }} PMObj */

/** @type {<P extends PM = PM>(s: string) => s is import('lockfile-tools/lib/package-managers.d.mts').LockfilesFor<P>} */
function isValidLockfile(s) {
	return values(PACKAGE_MANAGERS).some((pm) => pm.lockfiles.some((lf) => lf === s));
}

/** @type {(config: PM | PM[] | PMObj[]) => Map<PM, Set<Lockfile>> | null} */
function normalizeConfig(config) {
	/** @type {ReturnType<typeof normalizeConfig>} */
	let allowedManagers = new Map();

	/** @type {(PM | PMObj)[]} */ ([]).concat(config).forEach((item) => {
		if (allowedManagers === null) {
			return;
		}
		if (typeof item === 'string') {
			// item is guaranteed to be a valid PM name by schema
			const manager = PACKAGE_MANAGERS[item];
			allowedManagers.set(item, new Set([manager.defaultLockfile]));
		} else {
			// item must be an object with name and files (guaranteed by schema)
			// item.name is guaranteed to be a valid PM name by schema
			const manager = PACKAGE_MANAGERS[item.name];

			if (item.files === true) {
				allowedManagers.set(item.name, new Set(manager.lockfiles));
			} else {
				// item.files must be an array (guaranteed by schema)
				// Filter to valid lockfiles using type guard
				const validFiles = item.files
					.filter(isValidLockfile)
					.filter((f) => manager.lockfiles.some((lf) => lf === f));
				if (validFiles.length === 0) {
					allowedManagers = null;
					return;
				}
				allowedManagers.set(item.name, new Set(validFiles));
			}
		}
	});

	return allowedManagers;
}

/** @type {(allowedManagers: Map<PM, Set<Lockfile>>) => Set<Lockfile>} */
function getAllowedLockfiles(allowedManagers) {
	const lockfiles = new Set();
	from(allowedManagers.values()).forEach((files) => {
		from(files).forEach((file) => {
			lockfiles.add(file);
		});
	});
	return lockfiles;
}

const pms = /** @type {PM[]} */ (keys(PACKAGE_MANAGERS));

/** @type {import('eslint').Rule.RuleModule} */
export default {
	meta: {
		type: 'problem',
		docs: {
			description: 'enforce allowed lockfile formats',
			category: 'Possible Errors',
			recommended: true,
			url: 'https://github.com/ljharb/eslint-plugin-lockfile/blob/main/docs/rules/flavor.md',
		},
		schema: [
			{
				oneOf: [
					{ type: 'string', enum: pms },
					{
						type: 'array',
						items: {
							oneOf: [
								{ type: 'string', enum: pms },
								{
									type: 'object',
									properties: {
										name: { type: 'string', enum: pms },
										files: {
											oneOf: [
												{ type: 'boolean', enum: [true] },
												{
													type: 'array',
													items: { type: 'string' },
													minItems: 1,
													uniqueItems: true,
												},
											],
										},
									},
									required: ['name', 'files'],
									additionalProperties: false,
								},
							],
						},
					},
				],
			},
		],
		messages: {
			disallowedLockfile: 'Lockfile `{{filename}}` is not allowed. Allowed lockfiles: `{{allowed}}`',
			noLockfilesAllowed: 'No lockfiles are configured as allowed',
		},
	},

	create(context) {
		/** @type {PM} */
		const config = context.options[0] || 'npm';
		const allowedManagers = normalizeConfig(config);

		if (!allowedManagers || allowedManagers.size === 0) {
			return {};
		}

		const allowedLockfiles = getAllowedLockfiles(allowedManagers);

		return {
			Program(node) {
				// Use context.filename if available (ESLint 8.40+), fall back to getFilename() for older versions
				const filename = context.filename ?? context.getFilename();
				const dir = dirname(filename);
				const files = readdirSync(dir);

				const allPossibleLockfiles = new Set(values(PACKAGE_MANAGERS).flatMap((manager) => manager.lockfiles));

				// Filter files to valid lockfiles using type guard
				const foundLockfiles = files.filter(isValidLockfile).filter((f) => allPossibleLockfiles.has(f));

				foundLockfiles.forEach((lockfile) => {
					if (!allowedLockfiles.has(lockfile)) {
						context.report({
							node,
							messageId: 'disallowedLockfile',
							data: {
								filename: lockfile,
								allowed: from(allowedLockfiles).join(', '),
							},
						});
					}
				});
			},
		};
	},
};
