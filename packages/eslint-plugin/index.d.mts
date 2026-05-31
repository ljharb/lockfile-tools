import type { Rule } from 'eslint';
import type { Plugin } from '@eslint/core';

type LockfileRules = {
    'lockfile/binary-conflicts': 'error',
    'lockfile/flavor': ['error', 'npm'],
    'lockfile/integrity': 'error',
    'lockfile/manifest-sync': 'error',
    'lockfile/name-matches-resolved': 'error',
    'lockfile/non-registry-specifiers': 'error',
    'lockfile/registry': 'error',
    'lockfile/shrinkwrap': 'error',
    'lockfile/version': 'error',
};

type TrackedRules = {
    'lockfile/tracked': 'error',
};

type FlatConfigBlock<R> = {
    files: string[];
    languageOptions: { parser: unknown };
    rules: R;
};

type LegacyOverride<R> = {
    files: string[];
    rules: R;
};

declare const config: Plugin & {
    rules: {
        [k in
            | 'binary-conflicts'
            | 'flavor'
            | 'integrity'
            | 'manifest-sync'
            | 'name-matches-resolved'
            | 'non-registry-specifiers'
            | 'registry'
            | 'shrinkwrap'
            | 'tracked'
            | 'version'
        ]: Rule.RuleModule;
    };
    configs: {
        /** Flat config for ESLint >= 9 (an array of file-scoped blocks) */
        recommended: [FlatConfigBlock<LockfileRules>, FlatConfigBlock<TrackedRules>];
        /** Legacy config for ESLint 8 */
        'recommended-legacy': {
            overrides: [LegacyOverride<LockfileRules>, LegacyOverride<TrackedRules>];
        };
    };
};

export default config;