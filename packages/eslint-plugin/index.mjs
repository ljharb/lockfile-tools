import binaryConflicts from './rules/binary-conflicts.mjs';
import flavor from './rules/flavor.mjs';
import integrity from './rules/integrity.mjs';
import nameMatchesResolved from './rules/name-matches-resolved.mjs';
import nonRegistrySpecifiers from './rules/non-registry-specifiers.mjs';
import registry from './rules/registry.mjs';
import shrinkwrap from './rules/shrinkwrap.mjs';
import tracked from './rules/tracked.mjs';
import versionRule from './rules/version.mjs';
import { PACKAGE_MANAGERS } from 'lockfile-tools/package-managers';

import pkg from './package.json' with { type: 'json' };

const { version } = pkg;
const { values } = Object;

/** @import { Linter, Rule } from 'eslint' */
/** @import { default as PluginDefault } from './index.d.mts' */

/** @type {string[]} */
const ALL_LOCKFILES = values(PACKAGE_MANAGERS).flatMap((pm) => pm.lockfiles);

/** @type {string[]} */
const LOCKFILE_GLOBS = ALL_LOCKFILES.map((name) => `**/${name}`);

// Lockfiles aren't JavaScript (JSON, YAML, yarn-lock, binary), so the default
// parser fails on them. Each rule only listens to `Program` to trigger once
// per file and reads the file from disk itself, so an empty AST suffices.
/** @type {Linter.Parser} */
const noopParser = {
	meta: { name: 'eslint-plugin-lockfile/noop-parser', version },
	parseForESLint() {
		return {
			ast: {
				type: 'Program',
				body: [],
				sourceType: 'script',
				tokens: [],
				comments: [],
				loc: {
					start: { line: 1, column: 0 },
					end: { line: 1, column: 0 },
				},
				range: [0, 0],
			},
		};
	},
};

/** @type {Record<string, Rule.RuleModule>} */
const rules = {
	'binary-conflicts': binaryConflicts,
	flavor,
	integrity,
	'name-matches-resolved': nameMatchesResolved,
	'non-registry-specifiers': nonRegistrySpecifiers,
	registry,
	shrinkwrap,
	tracked,
	version: versionRule,
};

// Rules that operate on the lockfiles themselves.
/** @type {Record<string, Linter.RuleEntry>} */
const lockfileRules = {
	'lockfile/binary-conflicts': 'error',
	'lockfile/flavor': ['error', 'npm'],
	'lockfile/integrity': 'error',
	'lockfile/name-matches-resolved': 'error',
	'lockfile/non-registry-specifiers': 'error',
	'lockfile/registry': 'error',
	'lockfile/shrinkwrap': 'error',
	'lockfile/version': 'error',
};

// The `tracked` rule operates on `package.json` instead of the lockfiles,
// because it must run whether or not a lockfile exists (e.g. to flag a missing
// lockfile with no disabling config).
/** @type {Record<string, Linter.RuleEntry>} */
const trackedRules = {
	'lockfile/tracked': 'error',
};

// Lockfiles and `package.json` need different `files` globs, and a single flat
// config object only carries one glob - so the flat config is an array of
// blocks. Exporting an array also lets future blocks be added without a
// breaking shape change. Neither lockfiles nor `package.json` are JavaScript,
// so both blocks use the no-op parser.
/** @const @type {PluginDefault} */
export default {
	meta: {
		name: 'eslint-plugin-lockfile',
		version,
	},
	rules,
	configs: {
		// flat config (eslint >= 9)
		recommended: [
			{
				files: LOCKFILE_GLOBS,
				languageOptions: {
					parser: noopParser,
				},
				rules: lockfileRules,
			},
			{
				files: ['**/package.json'],
				languageOptions: {
					parser: noopParser,
				},
				rules: trackedRules,
			},
		],
		// legacy config (eslint 8)
		'recommended-legacy': {
			overrides: [
				{
					files: ALL_LOCKFILES,
					rules: lockfileRules,
				},
				{
					files: ['package.json'],
					rules: trackedRules,
				},
			],
		},
	},
};
