import flavor from './rules/flavor.mjs';
import integrity from './rules/integrity.mjs';
import registry from './rules/registry.mjs';
import versionRule from './rules/version.mjs';
import { PACKAGE_MANAGERS } from 'lockfile-tools/package-managers';

import pkg from './package.json' with { type: 'json' };

const { version } = pkg;
const { values } = Object;

/** @type {string[]} */
const ALL_LOCKFILES = values(PACKAGE_MANAGERS).flatMap((pm) => pm.lockfiles);

/** @type {string[]} */
const LOCKFILE_GLOBS = ALL_LOCKFILES.map((name) => `**/${name}`);

/** @type {Record<string, import('eslint').Rule.RuleModule>} */
const rules = {
	flavor,
	integrity,
	registry,
	version: versionRule,
};

/** @type {{ rules: Record<string, import('eslint').Linter.RuleEntry> }} */
const recommendedRules = {
	rules: {
		'lockfile/flavor': ['error', 'npm'],
		'lockfile/integrity': 'error',
		'lockfile/registry': 'error',
		'lockfile/version': 'error',
	},
};

/** @const @type {import('./index.d.mts').default} */
export default {
	meta: {
		name: 'eslint-plugin-lockfile',
		version,
	},
	rules,
	configs: {
		// flat config (eslint >= 9)
		recommended: {
			files: LOCKFILE_GLOBS,
			...recommendedRules,
		},
		// legacy config (eslint 8)
		'recommended-legacy': {
			overrides: [
				{
					files: ALL_LOCKFILES,
					...recommendedRules,
				},
			],
		},
	},
};
