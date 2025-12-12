import node from '@ljharb/eslint-config/flat/node/22';

export default /** @type {import('eslint').Linter.Config} */ ([
	...node,
	{
		rules: {
			'no-extra-parens': 'off',
		},
	},
]);
