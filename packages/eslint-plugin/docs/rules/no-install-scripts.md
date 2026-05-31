# Disallow packages that run install scripts unless explicitly allowed (`lockfile/no-install-scripts`)

💼 This rule is enabled in the following configs: ✅ `recommended`, `recommended-legacy`.

<!-- end auto-generated rule header -->

## Rule Details

Install/build lifecycle scripts (`preinstall`, `install`, `postinstall`, and native build steps) run arbitrary code on **every** install - in CI and on every developer's machine - before any of the package's code is ever imported. They are the single most common vector for npm supply-chain malware: a hijacked or malicious package's `postinstall` executes the moment you install it.

This rule treats the set of packages permitted to run install scripts as an explicit, reviewed allowlist - the same model pnpm 11 adopted as a default. Any package in the lockfile that runs an install script and is **not** on the allowlist is reported, so a newly-introduced install script (from a new dependency, or from a compromised version of an existing one) surfaces in review instead of silently executing.

Detection is static: npm lockfiles (`package-lock.json`, `npm-shrinkwrap.json`, v2/v3) record `"hasInstallScript": true` on each package that has one.

## What is *not* checked

- **yarn, pnpm, bun, vlt, and npm v1 lockfiles** do not record install-script information in a form that can be read statically here, so they are skipped. Use those package managers' own controls instead - e.g. pnpm's [`allowBuilds`](https://pnpm.io/settings#allowbuilds) / `onlyBuiltDependencies`, or yarn's [`enableScripts`](https://yarnpkg.com/configuration/yarnrc#enableScripts).

## npm's native `allowScripts` (npm ≥ 11.16)

[npm 11.16](https://docs.npmjs.com/cli/v11/commands/npm-approve-scripts/) added a native install-script approval mechanism: the `allowScripts` field in `package.json` (managed by `npm approve-scripts` / `npm deny-scripts`), with the `allow-scripts` config in `.npmrc` as a fallback. When this rule detects that the project is pinned to npm ≥ 11.16, it honors those approvals so you don't have to maintain the same allowlist twice:

- **npm version detection** - the project is treated as npm ≥ 11.16 when its `package.json` has a `packageManager` of `npm@11.16.0` (or newer), **or** an `engines.npm` range whose floor is `>= 11.16.0`. Without one of these signals, only this rule's own [allowlist option](#options) applies (an `allowScripts` field alone is *not* taken as proof of version).
- **Approvals suppress the warning** - a package set to `true` in `allowScripts` (or listed in the `.npmrc` `allow-scripts` fallback, used only when there is no `allowScripts` field) is not reported. An approval may pin a version (`"foo@1.2.3": true` only covers `foo@1.2.3`); a bare name (`"foo": true`) covers any version.
- **Denials are still reported** - `"foo": false` records that `foo` must *not* run scripts. npm denials are name-only and always win over an approval, so if a denied package nonetheless ships install scripts, this rule still flags it.

```jsonc
// package.json - on npm >= 11.16, esbuild is approved and won't be flagged
{
  "packageManager": "npm@11.16.0",
  "allowScripts": { "esbuild": true, "left-pad": false }
}
```

## Options

This rule accepts a single array of package names that are allowed to run install scripts. Entries may be exact names or globs (matched with [`minimatch`](https://www.npmjs.com/package/minimatch)). The default is an empty allowlist (every package that runs an install script is reported).

```json
{
  "rules": {
    "lockfile/no-install-scripts": ["error", ["esbuild", "@myorg/*"]]
  }
}
```

When you add a package to the allowlist, you are asserting that you have vetted what its install script does.

## When Not To Use It

If you run installs with scripts disabled everywhere (`npm install --ignore-scripts`, and the same in CI), the install-script vector is already closed and this rule is redundant.

## Further Reading

- [pnpm: supply-chain security](https://pnpm.io/supply-chain-security)
- [npm `--ignore-scripts`](https://docs.npmjs.com/cli/commands/npm-install#ignore-scripts)
