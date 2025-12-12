/**
 * ESLint compatibility helper for testing with both ESLint 8 and ESLint 9+
 */

import { ESLint } from 'eslint';

// Detect ESLint major version
const eslintVersion = ESLint.version;
const majorVersion = parseInt(eslintVersion.split('.')[0], 10);

/**
 * Creates ESLint options compatible with both ESLint 8 and ESLint 9
 * @param {import('eslint').Linter.FlatConfig} overrideConfig - The flat config to use
 * @param {string} cwd - The working directory
 * @returns {import('eslint').ESLint.Options}
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
	/** @type {Record<string, import('eslint').ESLint.Plugin>} */
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
	return /** @type {import('eslint').ESLint.Options} */ ({
		useEslintrc: false,
		plugins: pluginsMap,
		overrideConfig: /** @type {import('eslint').Linter.LegacyConfig} */ ({
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
 * @param {import('eslint').Linter.FlatConfig} config - The flat config to use
 * @param {string} cwd - The working directory
 * @returns {ESLint}
 */
export function createESLint(config, cwd) {
	const options = createESLintOptions(config, cwd);
	return new ESLint(options);
}

export { majorVersion as eslintMajorVersion };
