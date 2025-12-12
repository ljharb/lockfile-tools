import node from '@ljharb/eslint-config/flat/node/22';

export default /** @type {import('eslint').Linter.Config} */ ([
	...node,
	{
		rules: {
			'array-bracket-newline': 'off',
			'func-style': 'off',
			'id-length': 'off',
			'max-lines-per-function': 'off',
			'no-extra-parens': 'off',
			'prefer-named-capture-group': 'off', // due to https://github.com/microsoft/TypeScript/issues/32098
			'sort-keys': 'off',
		},
	},
]);
