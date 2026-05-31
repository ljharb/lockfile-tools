# Enforce that a lockfile stays in sync with its package.json (`lockfile/manifest-sync`)

💼 This rule is enabled in the following configs: ✅ `recommended`, `recommended-legacy`.

<!-- end auto-generated rule header -->

## Rule Details

A lockfile records the root package's declared dependency ranges, so the lockfile and the sibling `package.json` should always agree. When they drift, installs are no longer reproducible from the manifest, and a tampered lockfile can pull in dependencies the manifest never authorized.

This is the same invariant `npm ci` / `pnpm install --frozen-lockfile` enforce - they refuse to install when the manifest and lockfile are out of sync. Surfacing it as a lint rule catches the drift in review rather than only at install time.

The rule compares the dependency maps between the sibling `package.json` and the lockfile's recorded root dependencies, and reports:

- **`missing`** - a dependency is declared in `package.json` but absent from the lockfile (e.g. added to the manifest without reinstalling).
- **`extraneous`** - a dependency is recorded in the lockfile but not declared in `package.json` (e.g. injected into the lockfile, or removed from the manifest without reinstalling).
- **`rangeMismatch`** - a dependency is present in both, but the range recorded in the lockfile differs from the one declared in `package.json`.

In every case the fix is to run an install so the package manager rewrites the lockfile from the manifest.

## Supported lockfiles

| Lockfile | Source of the recorded ranges | Dep types compared |
| :------- | :---------------------------- | :----------------- |
| npm `package-lock.json` / `npm-shrinkwrap.json` (v2/v3) | the root `packages[""]` entry | `dependencies`, `devDependencies`, `optionalDependencies`, `peerDependencies` |
| `pnpm-lock.yaml` | the root (`.`) importer's `specifier`s | `dependencies`, `devDependencies`, `optionalDependencies` |
| `bun.lock` | the root `workspaces[""]` entry | `dependencies`, `devDependencies`, `optionalDependencies` |
| `vlt-lock.json` | the root project's `edges` (`file·. <name>`) | `dependencies`, `devDependencies`, `optionalDependencies` |

`peerDependencies` are only compared for npm; the other formats do not record them in a comparable place, so they are left out to avoid false positives.

## What is *not* checked

- **npm v1 lockfiles** and **yarn** do not separably record the root manifest's ranges, so they cannot be compared and are skipped. For yarn, use `yarn install --immutable`.
- **`bun.lockb`** (the binary lockfile) decodes to a yarn-style structure with no root workspace entry, so it is skipped; use `bun.lock` (the text lockfile).
- The rule compares **declared ranges**, not resolved versions; verifying that the resolved tree satisfies the manifest is what an install does.

## When Not To Use It

If you intentionally hand-maintain a lockfile that diverges from `package.json`, disable this rule. That is rarely a good idea.

## Further Reading

- [`npm ci`](https://docs.npmjs.com/cli/commands/npm-ci) - refuses to install when the manifest and lockfile are out of sync
