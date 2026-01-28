# eslint-plugin-lockfile <sup>[![Version Badge][npm-version-svg]][package-url]</sup>

[![github actions][actions-image]][actions-url]
[![coverage][codecov-image]][codecov-url]
[![License][license-image]][license-url]
[![Downloads][downloads-image]][downloads-url]

[![npm badge][npm-badge-png]][package-url]

An ESLint plugin to lint your npm ecosystem lockfiles for security and consistency issues.

This plugin supports lockfiles from npm, yarn, pnpm, bun, and vlt package managers.

## Installation

```sh
npm install eslint-plugin-lockfile --save-dev
```

## Configuration

### Flat Config (ESLint 9+)

```js
// eslint.config.js
import lockfile from 'eslint-plugin-lockfile';

export default [
	lockfile.configs.recommended,
];
```

### Legacy Config (ESLint 8)

```json
{
	"extends": ["plugin:lockfile/recommended-legacy"]
}
```

### Manual Configuration

```js
// eslint.config.js
import lockfile from 'eslint-plugin-lockfile';

export default [
	{
		files: ['**/package-lock.json', '**/yarn.lock', '**/pnpm-lock.yaml', '**/bun.lock', '**/bun.lockb', '**/vlt-lock.json'],
		plugins: { lockfile },
		rules: {
			'lockfile/flavor': ['error', 'npm'],
			'lockfile/version': 'error',
			'lockfile/integrity': 'error',
			'lockfile/registry': 'error',
			'lockfile/non-registry-specifiers': 'error',
			'lockfile/binary-conflicts': 'error',
		},
	},
];
```

## Supported Package Managers

| Package Manager | Lockfile(s) |
|-----------------|-------------|
| npm | `package-lock.json`, `npm-shrinkwrap.json` |
| yarn | `yarn.lock` |
| pnpm | `pnpm-lock.yaml` |
| bun | `bun.lock`, `bun.lockb` |
| vlt | `vlt-lock.json` |

## Rules

<!-- begin auto-generated rules list -->

💼 Configurations enabled in.\
✅ Set in the `recommended` configuration.

| Name                                                             | Description                                             | 💼                              |
| :--------------------------------------------------------------- | :------------------------------------------------------ | :------------------------------ |
| [binary-conflicts](docs/rules/binary-conflicts.md)               | detect binary name conflicts between packages           | ✅ ![badge-recommended-legacy][] |
| [flavor](docs/rules/flavor.md)                                   | enforce allowed lockfile formats                        | ✅ ![badge-recommended-legacy][] |
| [integrity](docs/rules/integrity.md)                             | enforce integrity values in lockfiles                   | ✅ ![badge-recommended-legacy][] |
| [non-registry-specifiers](docs/rules/non-registry-specifiers.md) | warn on dependencies from non-registry sources          | ✅ ![badge-recommended-legacy][] |
| [registry](docs/rules/registry.md)                               | enforce allowed registries in lockfiles                 | ✅ ![badge-recommended-legacy][] |
| [shrinkwrap](docs/rules/shrinkwrap.md)                           | detect dependencies that include an npm-shrinkwrap.json | ✅ ![badge-recommended-legacy][] |
| [version](docs/rules/version.md)                                 | enforce lockfile version                                | ✅ ![badge-recommended-legacy][] |

<!-- end auto-generated rules list -->

### `lockfile/flavor`

Enforces which lockfile formats are allowed in your project. This helps ensure your team uses a consistent package manager.

```js
// Allow only npm lockfiles
'lockfile/flavor': ['error', 'npm']

// Allow npm or yarn
'lockfile/flavor': ['error', ['npm', 'yarn']]

// Allow specific lockfile variants
'lockfile/flavor': ['error', [{ name: 'npm', files: ['package-lock.json'] }]]
```

### `lockfile/version`

Enforces lockfile versions to ensure consistency across environments.

```js
// Default: latest versions for each package manager
'lockfile/version': 'error'

// Specific versions
'lockfile/version': ['error', { npm: 3, yarn: 2, pnpm: '9.0' }]
```

**Valid versions:**
- npm: `1`, `2`, `3`
- yarn: `1`, `2`
- pnpm: `'5.3'`, `'5.4'`, `'6.0'`, `'6.1'`, `'7.0'`, `'9.0'`
- bun: `0`, `1`
- vlt: `0`

### `lockfile/integrity`

Ensures all packages have integrity hashes and verifies they match the actual package tarballs. This protects against supply chain attacks.

```js
// Default: allow all standard algorithms
'lockfile/integrity': 'error'

// Require specific algorithms
'lockfile/integrity': ['error', ['sha512', 'sha384']]
```

### `lockfile/registry`

Enforces that all packages come from allowed registries. Useful for security policies and private registry enforcement.

```js
// Default: uses npm config registry
'lockfile/registry': 'error'

// Single registry
'lockfile/registry': ['error', 'https://registry.npmjs.org']

// Multiple registries
'lockfile/registry': ['error', ['https://registry.npmjs.org', 'https://npm.pkg.github.com']]

// Per-package registry mapping
'lockfile/registry': ['error', {
	'https://registry.npmjs.org': true,  // Default for all packages
	'https://npm.pkg.github.com': ['@myorg/*'],  // Specific packages
}]
```

### `lockfile/non-registry-specifiers`

Warns when packages are installed from non-registry sources like GitHub URLs, git URLs, or local file paths. These can bypass integrity checks.

```js
// Warn on all non-registry specifiers
'lockfile/non-registry-specifiers': 'error'

// Ignore specific specifiers with explanation
'lockfile/non-registry-specifiers': ['error', {
	ignore: [
		{
			specifier: 'github:user/repo#commit',
			explanation: 'Required for unreleased bug fix',
		},
	],
}]
```

### `lockfile/binary-conflicts`

Detects when multiple packages provide command-line binaries with the same name, which can cause non-deterministic behavior.

```js
'lockfile/binary-conflicts': 'error'
```

## CLI

For a standalone CLI that doesn't require ESLint configuration, see [`lintlock`](https://www.npmjs.com/package/lintlock).

## Tests

Clone the repo, `npm install`, and run `npm test`.

## License

MIT

[package-url]: https://npmjs.org/package/eslint-plugin-lockfile
[npm-version-svg]: https://versionbadge.vercel.app/npm/eslint-plugin-lockfile.svg
[npm-badge-png]: https://nodei.co/npm/eslint-plugin-lockfile.png?downloads=true&stars=true
[license-image]: https://img.shields.io/npm/l/eslint-plugin-lockfile.svg
[license-url]: LICENSE
[downloads-image]: https://img.shields.io/npm/dm/eslint-plugin-lockfile.svg
[downloads-url]: https://npm-stat.com/charts.html?package=eslint-plugin-lockfile
[codecov-image]: https://codecov.io/gh/ljharb/eslint-plugin-lockfile/branch/main/graphs/badge.svg
[codecov-url]: https://app.codecov.io/gh/ljharb/eslint-plugin-lockfile/
[actions-image]: https://img.shields.io/endpoint?url=https://github-actions-badge-u3jn4tfber.now.sh/api/github/ljharb/eslint-plugin-lockfile
[actions-url]: https://github.com/ljharb/eslint-plugin-lockfile/actions
