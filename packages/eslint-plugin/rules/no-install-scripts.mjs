/*
This rule flags packages in the lockfile that run install/build lifecycle scripts (preinstall,
install, postinstall, or a native build step), unless they are explicitly allow-listed.

Install scripts are the single most common vector for npm malware: a compromised or malicious
package executes arbitrary code on every `npm install`, in CI and on developer machines, before
any of its code is ever imported. Treating the set of packages allowed to run install scripts as
an explicit, reviewed allowlist (as pnpm 11 now does by default) means a newly-introduced install
script - whether from a new dependency or a hijacked existing one - surfaces in review instead of
silently executing.

Detection is static: npm lockfiles (`package-lock.json`, `npm-shrinkwrap.json`, v2/v3) record
`"hasInstallScript": true` on each package that runs one. The other formats (yarn, pnpm, bun, vlt,
and npm v1) do not record install-script information in the lockfile in a form that can be checked
here, so they are skipped - rely on their own controls (e.g. pnpm's `allowBuilds`, yarn's
`enableScripts`) instead.

npm 11.16 added a native install-script approval mechanism: the `allowScripts` field in
`package.json` (managed by `npm approve-scripts` / `npm deny-scripts`), falling back to the
`allow-scripts` config in `.npmrc`. When the project is pinned to npm >= 11.16 (via its
`packageManager` field or an `engines.npm` range whose floor is >= 11.16.0), a scripted package
that is explicitly *approved* there is already vetted, so this rule does not flag it a second time.
Approvals may pin a version (`"foo@1.2.3": true`); a bare name approves any version. Explicit
*denials* (`"foo": false`) always lose - npm denials are name-only and win over any approval - so a
denied package that still ships install scripts continues to be reported.

The rule's own allowlist option accepts exact package names or globs (matched with `minimatch`).
*/

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { minimatch } from 'minimatch';
import npa from 'npm-package-arg';
import {
	coerce,
	gte,
	minVersion,
	satisfies,
} from 'semver';
import { PACKAGE_MANAGERS } from 'lockfile-tools/package-managers';
import { loadLockfileContent } from 'lockfile-tools/io';
import { forEachNpmPackagesMember } from 'lockfile-tools/npm';
import { createLockfileExtractor } from 'lockfile-tools/parsers';
import {
	parseJSON,
	getRootObject,
	getMember,
	getStringMember,
	getBooleanMember,
	forEachMember,
	nodeLine,
} from 'lockfile-tools/json-ast';
import { makeLockfileContentLoader, getContextFilename } from '../utils.mjs';

const { values } = Object;

/** @import { Rule } from 'eslint' */
/** @import { ObjectNode } from '@humanwhocodes/momoa' */
/** @import { Lockfile } from 'lockfile-tools/lib/package-managers.d.mts' */

/** @typedef {{ name: string, version: string | null, line: number }} ScriptedPackage */
/** @typedef {{ name: string, range: string }} Approval */
/** @typedef {{ active: boolean, approvals: Approval[], denied: Set<string> }} NativeApprovals */

// npm 11.16.0 introduced the native `allowScripts` install-script approval mechanism.
const NATIVE_ALLOW_SCRIPTS_MIN = '11.16.0';

/**
 * Recovers the actual package name from an npm v2/v3 lockfile key by taking the
 * segment after the final `node_modules/`. `forEachNpmPackagesMember` only
 * yields keys that start with `node_modules/`, so the marker is always present.
 * @type {(key: string) => string}
 */
function leafPackageName(key) {
	const marker = 'node_modules/';
	return key.slice(key.lastIndexOf(marker) + marker.length);
}

/** @type {(content: string) => ScriptedPackage[]} */
function extractFromNpmLockfile(content) {
	/** @type {ScriptedPackage[]} */
	const scripted = [];
	forEachNpmPackagesMember(getMember(getRootObject(parseJSON(content)), 'packages'), (member, key) => {
		if (getBooleanMember(member.value, 'hasInstallScript') === true) {
			scripted[scripted.length] = {
				name: leafPackageName(key),
				version: getStringMember(member.value, 'version'),
				line: nodeLine(member),
			};
		}
	});
	return scripted;
}

// yarn, pnpm, bun, vlt, and npm v1 do not record install-script information in a
// statically checkable form.
/** @type {() => ScriptedPackage[]} */
function extractNone() {
	return [];
}

/** @type {{ [k in Lockfile]: (s: string) => ScriptedPackage[] }} */
const extracts = {
	// @ts-expect-error TS doesn't understand dunder proto
	__proto__: null,
	'package-lock.json': extractFromNpmLockfile,
	'npm-shrinkwrap.json': extractFromNpmLockfile,
	'yarn.lock': extractNone,
	'pnpm-lock.yaml': extractNone,
	'bun.lock': extractNone,
	'bun.lockb': extractNone,
	'vlt-lock.json': extractNone,
};

/**
 * @param {string} filepath
 * @returns {string | null}
 */
function readFileSafe(filepath) {
	try {
		return readFileSync(filepath, 'utf8');
	} catch {
		return null;
	}
}

/**
 * Parses an `allowScripts` key / `allow-scripts` entry (a bare name or a pinned
 * `name@version`) into a package name and version range (`*` = any version) using
 * `npm-package-arg`, so scoped names are handled. Returns `null` for an entry that
 * is unparseable or names no package, so it can never match a lockfile entry.
 * @type {(entry: string) => Approval | null}
 */
function parseApproval(entry) {
	try {
		const { name, rawSpec } = npa(entry);
		return name ? { name, range: rawSpec } : null;
	} catch {
		return null;
	}
}

/**
 * Whether the project is pinned to npm >= 11.16.0 - the release that honors the
 * `allowScripts` field. Both `packageManager` (corepack, an exact `npm@x.y.z`) and
 * `engines.npm` (a range, honored only when its floor is >= 11.16.0, so every npm
 * version the project permits understands the field) are consulted.
 * @type {(pkgRoot: ObjectNode | null) => boolean}
 */
function honorsAllowScripts(pkgRoot) {
	const packageManager = getStringMember(pkgRoot, 'packageManager');
	if (packageManager && packageManager.startsWith('npm@')) {
		const version = coerce(packageManager.slice('npm@'.length).split('+')[0]);
		if (version && gte(version, NATIVE_ALLOW_SCRIPTS_MIN)) {
			return true;
		}
	}

	const enginesNpm = getStringMember(getMember(pkgRoot, 'engines'), 'npm');
	if (enginesNpm) {
		try {
			const floor = minVersion(enginesNpm);
			if (floor && gte(floor, NATIVE_ALLOW_SCRIPTS_MIN)) {
				return true;
			}
		} catch {
			// an unparseable `engines.npm` range gives no signal
		}
	}

	return false;
}

/**
 * Reads the `allow-scripts` value (a comma-separated package list) from the
 * `.npmrc` co-located with the lockfile, or `null` if absent. This is npm's
 * fallback approval source when `package.json` has no `allowScripts` field.
 * @type {(dir: string) => string | null}
 */
function readNpmrcAllowScripts(dir) {
	const content = readFileSafe(join(dir, '.npmrc'));
	if (content === null) {
		return null;
	}
	/** @type {string | null} */
	let value = null;
	content.split(/\r?\n/).forEach((rawLine) => {
		const line = rawLine.trim();
		if (line === '' || line.startsWith('#') || line.startsWith(';')) {
			return;
		}
		const eq = line.indexOf('=');
		if (eq !== -1 && line.slice(0, eq).trim() === 'allow-scripts') {
			value = line.slice(eq + 1).trim(); // a later definition wins, matching npm
		}
	});
	return value;
}

/**
 * Reads npm's native install-script approvals for the project rooted at `dir`.
 * `active` is true only when the project is pinned to npm >= 11.16.0. `approvals`
 * lists the approved name/range pairs; `denied` is the set of explicitly-denied
 * names (which always win and are still reported). Approvals come from
 * `package.json`'s `allowScripts` field, falling back to `.npmrc`'s `allow-scripts`
 * list only when the field is absent (mirroring npm's own precedence).
 * @type {(dir: string) => NativeApprovals}
 */
function readNativeApprovals(dir) {
	/** @type {NativeApprovals} */
	const inactive = {
		active: false, approvals: [], denied: new Set(),
	};

	const pkgContent = readFileSafe(join(dir, 'package.json'));
	if (pkgContent === null) {
		return inactive;
	}

	/** @type {ObjectNode | null} */
	let pkgRoot;
	try {
		pkgRoot = getRootObject(parseJSON(pkgContent));
	} catch {
		return inactive; // a malformed package.json is not this rule's concern
	}

	if (!honorsAllowScripts(pkgRoot)) {
		return inactive;
	}

	/** @type {Approval[]} */
	const approvals = [];
	/** @type {Set<string>} */
	const denied = new Set();

	const allowScripts = getMember(pkgRoot, 'allowScripts');
	if (allowScripts) {
		forEachMember(allowScripts, (member, key) => {
			const { value } = member;
			if (value.type !== 'Boolean') {
				return; // a non-boolean entry is not a valid approval/denial
			}
			const approval = parseApproval(key);
			if (!approval) {
				return;
			}
			if (value.value) {
				approvals[approvals.length] = approval;
			} else {
				denied.add(approval.name); // npm denials are name-only and always win
			}
		});
	} else {
		const list = readNpmrcAllowScripts(dir);
		if (list !== null) {
			list.split(',').forEach((raw) => {
				const approval = parseApproval(raw.trim());
				if (approval) {
					approvals[approvals.length] = approval;
				}
			});
		}
	}

	return {
		active: true, approvals, denied,
	};
}

/**
 * Whether `pkg` is approved to run install scripts by npm's native mechanism: the
 * project must be on npm >= 11.16, the name must not be denied, and an approval's
 * range must cover its version (a bare-name approval, range `*`, covers any version
 * - including a lockfile entry with no recorded version).
 * @type {(nativeApprovals: NativeApprovals, pkg: ScriptedPackage) => boolean}
 */
function isNativelyApproved(nativeApprovals, { name, version }) {
	return nativeApprovals.active
		&& !nativeApprovals.denied.has(name)
		&& nativeApprovals.approvals.some((approval) => approval.name === name && (
			approval.range === '*'
			|| (version !== null && satisfies(version, approval.range))
		));
}

/** @type {Rule.RuleModule} */
export default {
	meta: {
		type: 'problem',
		docs: {
			description: 'disallow packages that run install scripts unless explicitly allowed',
			// @ts-expect-error - `category` was removed from `RulesMetaDocs` in eslint@10 types but is still consumed by eslint-doc-generator
			category: 'Possible Errors',
			recommended: true,
			url: 'https://github.com/ljharb/lockfile-tools/blob/HEAD/packages/eslint-plugin/docs/rules/no-install-scripts.md',
		},
		schema: [
			{
				type: 'array',
				items: { type: 'string' },
				uniqueItems: true,
			},
		],
		messages: {
			installScript: 'Package `{{name}}` in lockfile `{{filename}}` runs install/build scripts but is not allowed. Vet it, then either add it to this rule\'s allowlist or, on npm >= 11.16, approve it with `npm approve-scripts`.',
			malformedLockfile: 'Lockfile "{{filename}}" is malformed: {{error}}',
		},
	},

	create(context) {
		const allow = context.options[0] || [];
		const lockfiles = values(PACKAGE_MANAGERS).flatMap((pm) => pm.lockfiles);

		/** @type {(name: string) => boolean} */
		const isAllowed = (name) => allow.some((/** @type {string} */ pattern) => minimatch(name, pattern));

		return {
			Program(node) {
				const dir = dirname(getContextFilename(context));
				const nativeApprovals = readNativeApprovals(dir);
				const extractFromLockfile = createLockfileExtractor(
					extracts,
					null,
					makeLockfileContentLoader(context, loadLockfileContent),
				);

				lockfiles.forEach((filename) => {
					/** @type {ScriptedPackage[]} */
					let scripted;
					try {
						scripted = extractFromLockfile(join(dir, filename));
					} catch (e) {
						context.report({
							node,
							messageId: 'malformedLockfile',
							data: {
								filename,
								error: e instanceof Error ? e.message : String(e),
							},
						});
						return;
					}

					scripted.forEach((pkg) => {
						if (isAllowed(pkg.name) || isNativelyApproved(nativeApprovals, pkg)) {
							return;
						}
						context.report({
							node,
							loc: { start: { line: pkg.line, column: 0 }, end: { line: pkg.line, column: 0 } },
							messageId: 'installScript',
							data: { name: pkg.name, filename },
						});
					});
				});
			},
		};
	},
};
