import type { Rule } from 'eslint';
import type { Plugin } from '@eslint/core';

type RecommendedRules = {
    'lockfile/binary-conflicts': 'error',
    'lockfile/flavor': ['error', 'npm'],
    'lockfile/integrity': 'error',
    'lockfile/non-registry-specifiers': 'error',
    'lockfile/registry': 'error',
    'lockfile/shrinkwrap': 'error',
    'lockfile/version': 'error',
};

type RecommendedConfig = {
    files: string[];
    rules: RecommendedRules;
};

declare const config: Plugin & {
    rules: {
        [k in
            | 'binary-conflicts'
            | 'flavor'
            | 'integrity'
            | 'non-registry-specifiers'
            | 'registry'
            | 'shrinkwrap'
            | 'version'
        ]: Rule.RuleModule;
    };
    configs: {
        /** Flat config for ESLint >= 9 */
        recommended: RecommendedConfig;
        /** Legacy config for ESLint 8 */
        'recommended-legacy': {
            overrides: [RecommendedConfig];
        };
    };
};

export default config;