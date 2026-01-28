# Detect binary name conflicts between packages (`lockfile/binary-conflicts`)

💼 This rule is enabled in the following configs: ✅ `recommended`, `recommended-legacy`.

<!-- end auto-generated rule header -->

## Rule Details

This rule detects when multiple packages in the lockfile provide command-line binaries with the same name.
When multiple packages export the same binary name, the behavior is non-deterministic and varies across package managers:

- **npm**: The first package installed wins, but this can be non-deterministic due to race conditions in parallel installs
- **pnpm**: Warns about conflicts and shows which package is being used
- **Yarn**: One package overwrites the other (non-deterministic)
- **Bun**: Behavior not well-documented

This rule helps catch these conflicts before they cause issues in your project or CI/CD pipeline.

The rule checks these lockfile formats:
 - `package-lock.json` / `npm-shrinkwrap.json`
 - `yarn.lock`
 - `pnpm-lock.yaml`
 - `bun.lockb` (binary format)
 - `vlt-lock.json`

**Note**: The rule uses `pacote` to fetch package manifests from the npm registry/cache, so it does not require `node_modules` to be installed.

If no lockfile exists, the rule will use `@npmcli/arborist` to build a virtual dependency tree from `package.json` and check for binary conflicts among the resolved dependencies.

Examples of **incorrect** code for this rule:

```json
// Two packages both provide a binary named "cli-tool"
// package-lock.json
{
  "packages": {
    "node_modules/package-a": {
      "version": "1.0.0"
      // package.json has: "bin": { "cli-tool": "./bin/cli.js" }
    },
    "node_modules/package-b": {
      "version": "2.0.0"
      // package.json has: "bin": { "cli-tool": "./bin/tool.js" }
    }
  }
}
// ❌ Error: Binary name conflict - both packages provide "cli-tool"
```

Examples of **correct** code for this rule:

```json
// Each package provides uniquely named binaries
// package-lock.json
{
  "packages": {
    "node_modules/package-a": {
      "version": "1.0.0"
      // package.json has: "bin": { "tool-a": "./bin/cli.js" }
    },
    "node_modules/package-b": {
      "version": "2.0.0"
      // package.json has: "bin": { "tool-b": "./bin/tool.js" }
    }
  }
}
// ✅ No conflicts - binaries have different names
```

## Error Messages

The rule provides different error messages based on the conflict scenario:

### Multiple direct dependencies with the same binary

```
Binary name conflict: `my-cli` is provided by multiple packages: package-a@1.0.0, package-b@2.0.0
```

### One direct dependency and one transitive dependency

```
Binary name conflict: `my-cli` is provided by 2 packages. Currently active: package-a@1.0.0 (direct dependency). Also provided by: package-b@2.0.0
```

When exactly one package is a direct dependency, the rule indicates that this package will likely be the active one, though this is still not guaranteed across all package managers.

## When Not To Use It

- If you're aware of binary conflicts in your dependencies and have verified which binary will be used
- If you're using a package manager that doesn't support binaries
- During initial development when you haven't yet resolved dependency conflicts

## Related Research

- [npm binary conflict discussion #7130](https://github.com/npm/npm/issues/7130)
- [npm conflicting bin executables #6152](https://github.com/npm/cli/issues/6152)
- [pnpm binary override support #1488](https://github.com/pnpm/pnpm/issues/1488)
- [Yarn bin directory conflict #3975](https://github.com/yarnpkg/yarn/issues/3975)
- [How bin linking works in npm and yarn](https://www.jonathancreamer.com/how-bin-linking-works-in-node-js-npm-and-yarn-and-monorepos/)

## Further Reading

- [package.json bin field](https://docs.npmjs.com/cli/v8/configuring-npm/package-json#bin)
- [npm binaries](https://docs.npmjs.com/cli/v8/configuring-npm/folders#executables)
