# lockfile-tools <sup>[![Version Badge][npm-version-svg]][package-url]</sup>

[![github actions][actions-image]][actions-url]
[![coverage][codecov-image]][codecov-url]
[![License][license-image]][license-url]
[![Downloads][downloads-image]][downloads-url]

[![npm badge][npm-badge-png]][package-url]

Utilities for parsing and working with npm ecosystem lockfiles.

Supports npm, yarn, pnpm, bun (including binary `.lockb`), and vlt lockfiles.

## Installation

```sh
npm install lockfile-tools
```

## Usage

### Package Managers

```js
import { PACKAGE_MANAGERS } from 'lockfile-tools/package-managers';

console.log(PACKAGE_MANAGERS.npm);
// { lockfiles: ['package-lock.json', 'npm-shrinkwrap.json'], defaultLockfile: 'package-lock.json' }

console.log(PACKAGE_MANAGERS.yarn);
// { lockfiles: ['yarn.lock'], defaultLockfile: 'yarn.lock' }
```

Available package managers: `npm`, `yarn`, `pnpm`, `bun`, `vlt`

### File I/O

```js
import {
	loadLockfileContent,
	loadBunLockbContent,
	getLockfileName,
	findJsonKeyLine,
} from 'lockfile-tools/io';

// Load lockfile content as string
const content = loadLockfileContent('/path/to/package-lock.json');

// Load binary bun.lockb files (converts to yarn.lock format)
const bunContent = loadBunLockbContent('/path/to/bun.lockb');

// Get lockfile basename
const name = getLockfileName('/path/to/package-lock.json');
// 'package-lock.json'

// Find line number of a JSON key
const line = findJsonKeyLine(content, 'node_modules/tape');
// 42
```

### Parsers

```js
import {
	parseYarnLockfile,
	parsePnpmLockfile,
	createLockfileExtractor,
} from 'lockfile-tools/parsers';

// Parse yarn.lock
const yarnEntries = parseYarnLockfile(content, ['resolved', 'integrity']);
// [{ name: 'pkg@^1.0.0', resolved: 'https://...', integrity: 'sha512-...', line: 5 }]

// Parse pnpm-lock.yaml
const pnpmEntries = parsePnpmLockfile(content, ['tarball', 'integrity']);
// [{ name: 'pkg@1.0.0', resolved: 'https://...', integrity: 'sha512-...', line: 10 }]

// Create a generic extractor that handles all formats
const extract = createLockfileExtractor({
	'package-lock.json': (content) => extractFromNpm(content),
	'yarn.lock': (content) => parseYarnLockfile(content, ['resolved']),
	// ... other formats
}, bunLockbExtractor);
```

### Registry Utilities

```js
import {
	normalizeRegistry,
	extractRegistryFromUrl,
} from 'lockfile-tools/registry';

// Normalize registry URL
normalizeRegistry('https://registry.npmjs.org/');
// 'https://registry.npmjs.org'

// Extract registry from tarball URL
extractRegistryFromUrl('https://registry.npmjs.org/tape/-/tape-5.0.0.tgz');
// 'https://registry.npmjs.org'

// Works with path-based registries too
extractRegistryFromUrl('https://artifacts.example.com/api/npm/repo/tape/-/tape-5.0.0.tgz');
// 'https://artifacts.example.com/api/npm/repo'
```

### npm Utilities

```js
import {
	traverseDependencies,
	extractPackageName,
} from 'lockfile-tools/npm';

// Traverse npm lockfile v1 dependencies recursively
traverseDependencies(deps, (name, dep) => {
	console.log(name, dep.version, dep.resolved);
});

// Extract package name from lockfile key
extractPackageName('node_modules/@scope/package-name');
// '@scope/package-name'
```

### Virtual Lockfile

When no physical lockfile exists, generate a virtual one using `@npmcli/arborist`:

```js
import {
	hasLockfile,
	buildVirtualLockfile,
} from 'lockfile-tools/virtual';

// Check if any lockfile exists
if (!hasLockfile('/path/to/project')) {
	// Build virtual lockfile from package.json + node_modules
	const packages = await buildVirtualLockfile('/path/to/project');
	// [{ name: 'tape', version: '5.0.0', resolved: 'https://...', integrity: 'sha512-...', isDirect: true }]
}
```

## Exports

This package provides the following subpath exports:

| Export | Description |
|--------|-------------|
| `lockfile-tools/package-managers` | Package manager definitions and lockfile names |
| `lockfile-tools/io` | File I/O operations |
| `lockfile-tools/parsers` | Lockfile format parsers |
| `lockfile-tools/registry` | Registry URL utilities |
| `lockfile-tools/npm` | npm lockfile-specific utilities |
| `lockfile-tools/virtual` | Virtual lockfile generation via arborist |

## Supported Lockfiles

| Package Manager | Lockfile(s) |
|-----------------|-------------|
| npm | `package-lock.json`, `npm-shrinkwrap.json` |
| yarn | `yarn.lock` (v1 and v2) |
| pnpm | `pnpm-lock.yaml` |
| bun | `bun.lock`, `bun.lockb` (binary) |
| vlt | `vlt-lock.json` |

## Tests

Clone the repo, `npm install`, and run `npm test`.

## License

MIT

[package-url]: https://npmjs.org/package/lockfile-tools
[npm-version-svg]: https://versionbadge.vercel.app/npm/lockfile-tools.svg
[npm-badge-png]: https://nodei.co/npm/lockfile-tools.png?downloads=true&stars=true
[license-image]: https://img.shields.io/npm/l/lockfile-tools.svg
[license-url]: LICENSE
[downloads-image]: https://img.shields.io/npm/dm/lockfile-tools.svg
[downloads-url]: https://npm-stat.com/charts.html?package=lockfile-tools
[codecov-image]: https://codecov.io/gh/ljharb/eslint-plugin-lockfile/branch/main/graphs/badge.svg
[codecov-url]: https://app.codecov.io/gh/ljharb/eslint-plugin-lockfile/
[actions-image]: https://img.shields.io/endpoint?url=https://github-actions-badge-u3jn4tfber.now.sh/api/github/ljharb/eslint-plugin-lockfile
[actions-url]: https://github.com/ljharb/eslint-plugin-lockfile/actions
