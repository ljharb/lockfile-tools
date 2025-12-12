import flavor from './rules/flavor.mjs';
import integrity from './rules/integrity.mjs';
import registry from './rules/registry.mjs';
import version from './rules/version.mjs';

export default {
	rules: {
		flavor,
		integrity,
		registry,
		version,
	},
};
