# Detect dependencies that include an npm-shrinkwrap.json (`lockfile/shrinkwrap`)

💼 This rule is enabled in the following configs: ✅ `recommended`, `recommended-legacy`.

<!-- end auto-generated rule header -->

## Rule Details

This rule detects when a dependency in the lockfile includes an `npm-shrinkwrap.json`.

When a dependency ships an `npm-shrinkwrap.json`, npm uses it to lock that dependency's transitive dependencies to specific versions. This can:

- **Prevent security updates** from being applied to transitive dependencies
- **Cause version conflicts** when multiple packages shrinkwrap the same transitive dependency at different versions
- **Make the dependency tree harder to reason about**, since the lockfile no longer fully describes what gets installed

The rule checks these lockfile formats:
 - `package-lock.json` / `npm-shrinkwrap.json`
 - `yarn.lock`
 - `pnpm-lock.yaml`
 - `bun.lock` / `bun.lockb`
 - `vlt-lock.json`

**Note**: The rule uses `pacote` to fetch package manifests from the npm registry/cache, so it does not require `node_modules` to be installed.

If no lockfile exists, the rule will use `@npmcli/arborist` to build a virtual dependency tree from `package.json` and check the resolved dependencies.

Examples of **incorrect** code for this rule:

```json
// package-lock.json containing a dependency that ships npm-shrinkwrap.json
{
  "packages": {
    "node_modules/some-shrinkwrapped-package": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/some-shrinkwrapped-package/-/some-shrinkwrapped-package-1.0.0.tgz"
      // ❌ This package includes an npm-shrinkwrap.json
    }
  }
}
```

Examples of **correct** code for this rule:

```json
// package-lock.json containing only dependencies without npm-shrinkwrap.json
{
  "packages": {
    "node_modules/normal-package": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/normal-package/-/normal-package-1.0.0.tgz"
      // ✅ This package does not include an npm-shrinkwrap.json
    }
  }
}
```

## Options

### `ignore`

An array of npm package specifiers to ignore. Each entry must be a valid [npm-package-arg](https://www.npmjs.com/package/npm-package-arg) registry specifier (e.g., a package name with an optional semver range).

```json
{
  "rules": {
    "lockfile/shrinkwrap": ["error", [
      "some-shrinkwrapped-package",
      "another-package@^1.0.0",
      "@scope/pkg@2.x"
    ]]
  }
}
```

- A bare package name (e.g., `"foo"`) ignores all versions of that package.
- A name with a semver range (e.g., `"foo@^1.0.0"`) ignores only versions matching the range.
- Scoped packages are supported (e.g., `"@scope/pkg"`, `"@scope/pkg@>=2.0.0"`).
- Non-registry specifiers (e.g., GitHub URLs, git URLs) are not allowed in the ignore list and will produce an error.

## When Not To Use It

If you are not concerned about dependencies shipping `npm-shrinkwrap.json` files, or if your project intentionally depends on packages that use shrinkwrap for stability reasons, you may want to disable this rule or use the `ignore` option.

## Further Reading

- [npm-shrinkwrap.json](https://docs.npmjs.com/cli/v10/configuring-npm/npm-shrinkwrap-json) - npm documentation on shrinkwrap
- [npm shrinkwrap command](https://docs.npmjs.com/cli/v10/commands/npm-shrinkwrap)
