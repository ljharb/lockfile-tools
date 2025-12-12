import flavor from './rules/flavor.mjs';
import integrity from './rules/integrity.mjs';
import version from './rules/version.mjs';

export default {
	rules: {
		flavor,
		integrity,
		version,
	},
};
