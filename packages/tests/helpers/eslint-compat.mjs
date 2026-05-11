/**
 * ESLint compatibility helper for testing with both ESLint 8 and ESLint 9+
 */

import { ESLint } from 'eslint';

// Detect ESLint major version
const eslintVersion = ESLint.version;
const majorVersion = parseInt(eslintVersion.split('.')[0], 10);

/** @import { ESLint as ESLintNS, Linter } from 'eslint' */

/**
 * Creates ESLint options compatible with both ESLint 8 and ESLint 9
 * @param {Linter.FlatConfig} overrideConfig - The flat config to use
 * @param {string} cwd - The working directory
 * @returns {ESLintNS.Options}
 */
export function createESLintOptions(overrideConfig, cwd) {
	if (majorVersion >= 9) {
		// ESLint 9+ uses flat config
		return {
			overrideConfigFile: true,
			overrideConfig,
			cwd,
		};
	}

	// ESLint 8 uses legacy config format
	const {
		plugins,
		rules,
	} = overrideConfig;

	// Convert flat config plugins to legacy format
	/** @type {string[]} */
	const pluginNames = [];
	/** @type {Record<string, ESLintNS.Plugin>} */
	const pluginsMap = {};

	if (plugins) {
		for (const [name, pluginModule] of Object.entries(plugins)) {
			pluginNames.push(name);
			pluginsMap[name] = pluginModule;
		}
	}

	// In ESLint 8, rules need to be at the root level of overrideConfig
	// The plugins array in overrideConfig is just plugin names as strings
	// We also need to set parserOptions.ecmaVersion for modern JS syntax
	return /** @type {ESLintNS.Options} */ ({
		useEslintrc: false,
		plugins: pluginsMap,
		overrideConfig: /** @type {Linter.LegacyConfig} */ ({
			plugins: pluginNames,
			parserOptions: {
				ecmaVersion: 2022,
			},
			rules,
		}),
		cwd,
	});
}

/**
 * Creates an ESLint instance with options compatible with both ESLint 8 and ESLint 9
 * @param {Linter.FlatConfig} config - The flat config to use
 * @param {string} cwd - The working directory
 * @returns {ESLint}
 */
export function createESLint(config, cwd) {
	const options = createESLintOptions(config, cwd);
	return new ESLint(options);
}

export { majorVersion as eslintMajorVersion };
