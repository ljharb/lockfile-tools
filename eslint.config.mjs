import node from '@ljharb/eslint-config/flat/node/22';

export default /** @type {import('eslint').Linter.Config} */ ([
	...node,
	{
		rules: {
			'array-bracket-newline': 'off',
			'func-style': 'off',
			'id-length': 'off',
			'max-len': 'off',
			'max-lines-per-function': 'off',
			'max-lines': 'off',
			'max-params': ['error', { max: 4 }],
			'max-statements': 'off',
			'multiline-comment-style': 'off',
			'no-extra-parens': 'off',
			'prefer-named-capture-group': 'off', // due to https://github.com/microsoft/TypeScript/issues/32098
			'sort-keys': 'off',
		},
	},
	{
		files: ['packages/eslint-plugin/**'],
		rules: {
			eqeqeq: ['error', 'allow-null'],
			'max-depth': 'off',
			'max-nested-callbacks': 'off',
			'no-magic-numbers': 'off',
			'no-negated-condition': 'warn',
		},
	},
	{
		files: ['packages/tests/**'],
		rules: {
			'max-nested-callbacks': 'off',
			'max-statements-per-line': 'off',
		},
	},
]);
