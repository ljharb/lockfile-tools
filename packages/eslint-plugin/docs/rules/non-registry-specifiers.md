# Warn on dependencies from non-registry sources (`lockfile/non-registry-specifiers`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

This rule warns when dependencies in your lockfiles are pulled from non-registry sources such as GitHub URLs, tarball URLs, git URLs, or file paths rather than proper npm registries.
Non-registry specifiers can bypass integrity checks, do not provide the full power of semver, and may not be as reliable as published packages.

The rule also warns on non-HTTPS registry URLs as they are insecure.

The rule checks these lockfile formats:
 - `package-lock.json` / `npm-shrinkwrap.json`
 - `yarn.lock`
 - `pnpm-lock.yaml`
 - `bun.lockb` (binary format)

**Note**: `bun.lock` (text format) and `vlt-lock.json` do not store resolved URLs, so they cannot be checked by this rule.

If no lockfile exists, the rule will use `@npmcli/arborist` to build a virtual dependency tree from `package.json` and check the resolved URLs of dependencies.

Examples of **incorrect** code for this rule:

```json
// package-lock.json with GitHub tarball
{
  "packages": {
    "node_modules/example": {
      "version": "1.0.0",
      "resolved": "https://github.com/user/repo/tarball/main"
      // ❌ Package from GitHub tarball instead of registry
    }
  }
}
```

```json
// package-lock.json with git URL
{
  "packages": {
    "node_modules/example": {
      "version": "1.0.0",
      "resolved": "git+https://github.com/user/repo.git#main"
      // ❌ Package from git URL
    }
  }
}
```

```json
// package-lock.json with file path
{
  "packages": {
    "node_modules/example": {
      "version": "1.0.0",
      "resolved": "file:../local-package"
      // ❌ Package from local file path
    }
  }
}
```

```json
// package-lock.json with insecure HTTP registry
{
  "packages": {
    "node_modules/example": {
      "version": "1.0.0",
      "resolved": "http://registry.npmjs.org/example/-/example-1.0.0.tgz"
      // ❌ Using insecure HTTP instead of HTTPS
    }
  }
}
```

Examples of **correct** code for this rule:

```json
// package-lock.json with registry URL
{
  "packages": {
    "node_modules/example": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/example/-/example-1.0.0.tgz"
      // ✅ Package from HTTPS registry
    }
  }
}
```

## Options

### `ignore`

You can configure an array of dependencies to ignore with justifications:

```json
{
  "rules": {
    "lockfile/non-registry-specifiers": ["error", {
      "ignore": [
        {
          "specifier": "https://github.com/myorg/private-package/tarball/v1.0.0",
          "explanation": "Private package maintained by our team, not published to npm"
        }
      ]
    }]
  }
}
```

Each ignored entry must include:
- `specifier`: The exact dependency specifier or a substring that appears in the resolved URL
- `explanation`: A justification for why this non-registry dependency is allowed

**Note**: HTTP registry URLs are always reported, even if in the ignore list, as they pose a security risk.

## When Not To Use It

If your project intentionally uses dependencies from GitHub, git repositories, or local file paths and you understand the security implications, you may want to disable this rule.

## Further Reading

- [npm install - Package References](https://docs.npmjs.com/cli/v8/commands/npm-install#description)
- [Lockfile Lint](https://github.com/lirantal/lockfile-lint) - Inspiration for this rule
