# lintlock <sup>[![Version Badge][npm-version-svg]][package-url]</sup>

[![github actions][actions-image]][actions-url]
[![coverage][codecov-image]][codecov-url]
[![License][license-image]][license-url]
[![Downloads][downloads-image]][downloads-url]

[![npm badge][npm-badge-png]][package-url]

CLI for linting npm ecosystem lockfiles for security and consistency issues.

A standalone CLI wrapper around [`eslint-plugin-lockfile`](https://www.npmjs.com/package/eslint-plugin-lockfile) that works without any ESLint configuration.

## Installation

```sh
npm install -g lintlock
```

Or use with npx:

```sh
npx lintlock
```

## Usage

```sh
lintlock [options] [lockfile-path]
```

If no lockfile path is provided, searches the current directory for lockfiles.

### Options

| Option | Alias | Description |
|--------|-------|-------------|
| `--flavor <pm>` | `-f` | Allowed package manager(s): `npm`, `yarn`, `pnpm`, `bun`, `vlt`. Can be specified multiple times. Defaults to auto-detect. |
| `--registry <url>` | `-r` | Allowed registry URL(s). Can be specified multiple times. Defaults to npm config. |
| `--algorithms <alg>` | `-a` | Allowed integrity hash algorithm(s): `sha1`, `sha256`, `sha384`, `sha512`. Can be specified multiple times. Defaults to all. |
| `--help` | | Show help message |

## Examples

### Basic Usage

Lint lockfile in current directory:

```sh
lintlock
```

Lint a specific lockfile:

```sh
lintlock package-lock.json
lintlock /path/to/project/yarn.lock
```

### Restrict Package Managers

Allow only npm lockfiles:

```sh
lintlock -f npm
```

Allow npm or yarn:

```sh
lintlock -f npm -f yarn
```

### Restrict Registries

Require packages from the official npm registry:

```sh
lintlock -r https://registry.npmjs.org/
```

Allow multiple registries:

```sh
lintlock -r https://registry.npmjs.org/ -r https://npm.pkg.github.com/
```

### Restrict Integrity Algorithms

Require SHA-512 integrity hashes:

```sh
lintlock -a sha512
```

Allow SHA-512 or SHA-384:

```sh
lintlock -a sha512 -a sha384
```

### Combined Options

```sh
lintlock -f npm -r https://registry.npmjs.org/ -a sha512 package-lock.json
```

## Exit Codes

| Code | Description |
|------|-------------|
| `0` | No errors found (warnings are OK) |
| `1` | Errors found or execution failed |

## Supported Lockfiles

| Package Manager | Lockfile(s) |
|-----------------|-------------|
| npm | `package-lock.json`, `npm-shrinkwrap.json` |
| yarn | `yarn.lock` |
| pnpm | `pnpm-lock.yaml` |
| bun | `bun.lock`, `bun.lockb` |
| vlt | `vlt-lock.json` |

## Rules

The CLI runs the following checks from `eslint-plugin-lockfile`:

- **flavor** - Ensures only allowed lockfile formats are present
- **version** - Validates lockfile version
- **integrity** - Verifies all packages have valid integrity hashes
- **registry** - Ensures packages come from allowed registries
- **non-registry-specifiers** - Warns on non-registry dependencies (GitHub, git, file paths)
- **binary-conflicts** - Detects binary name conflicts between packages

## Programmatic Usage

```js
import { lintLockfile } from 'lintlock';

const exitCode = await lintLockfile('/path/to/package-lock.json', {
	flavor: ['npm'],
	registry: ['https://registry.npmjs.org/'],
	algorithms: ['sha512'],
});

process.exit(exitCode);
```

## Related

- [`eslint-plugin-lockfile`](https://www.npmjs.com/package/eslint-plugin-lockfile) - ESLint plugin with configurable rules
- [`lockfile-tools`](https://www.npmjs.com/package/lockfile-tools) - Utilities for parsing lockfiles

## Tests

Clone the repo, `npm install`, and run `npm test`.

## License

MIT

[package-url]: https://npmjs.org/package/lintlock
[npm-version-svg]: https://versionbadge.vercel.app/npm/lintlock.svg
[npm-badge-png]: https://nodei.co/npm/lintlock.png?downloads=true&stars=true
[license-image]: https://img.shields.io/npm/l/lintlock.svg
[license-url]: LICENSE
[downloads-image]: https://img.shields.io/npm/dm/lintlock.svg
[downloads-url]: https://npm-stat.com/charts.html?package=lintlock
[codecov-image]: https://codecov.io/gh/ljharb/eslint-plugin-lockfile/branch/main/graphs/badge.svg
[codecov-url]: https://app.codecov.io/gh/ljharb/eslint-plugin-lockfile/
[actions-image]: https://img.shields.io/endpoint?url=https://github-actions-badge-u3jn4tfber.now.sh/api/github/ljharb/eslint-plugin-lockfile
[actions-url]: https://github.com/ljharb/eslint-plugin-lockfile/actions
