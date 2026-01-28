# Enforce allowed registries in lockfiles (`lockfile/registry`)

💼 This rule is enabled in the following configs: ✅ `recommended`, `recommended-legacy`.

<!-- end auto-generated rule header -->

## Rule Details

This rule ensures that all packages in your lockfiles are downloaded from trusted registries. It helps prevent supply chain attacks by blocking packages from unauthorized or compromised registries.

The rule checks all known versions of these lockfile formats that store registry URLs:
 - `package-lock.json` / `npm-shrinkwrap.json`
 - `yarn.lock`
 - `pnpm-lock.yaml`
 - `bun.lockb` (binary format)

**Note**: `bun.lock` (text format) and `vlt-lock.json` do not store registry URLs, so they are not checked by this rule.

If no lockfile exists, the rule will use `@npmcli/arborist` to build a virtual dependency tree from `package.json` and check the registries of resolved dependencies.

Examples of **incorrect** code for this rule:

```json
// package-lock.json with disallowed registry
{
  "packages": {
    "node_modules/example": {
      "version": "1.0.0",
      "resolved": "https://untrusted-registry.example.com/example/-/example-1.0.0.tgz",
      // ❌ Package from disallowed registry
      "integrity": "sha512-abc123..."
    }
  }
}
```

Examples of **correct** code for this rule:

```json
// package-lock.json with allowed registry (default: npmjs.org)
{
  "packages": {
    "node_modules/example": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/example/-/example-1.0.0.tgz",
      // ✅ Package from allowed registry
      "integrity": "sha512-abc123..."
    }
  }
}
```

## Options

This rule accepts either:
- A string URL (single registry)
- An array of string URLs (multiple registries)
- An object mapping registry URLs to package name patterns (granular control)

### Default Configuration

By default, the rule allows only the registry configured in your npm config:

```json
{
  "rules": {
    "lockfile/registry": "error"
  }
}
```

This uses the value from `npm config get registry`, which is typically `https://registry.npmjs.org/`.

### Single Registry

Allow packages only from a specific registry:

```json
{
  "rules": {
    "lockfile/registry": ["error", "https://registry.npmjs.org/"]
  }
}
```

### Multiple Registries

Allow packages from multiple trusted registries:

```json
{
  "rules": {
    "lockfile/registry": [
      "error",
      [
        "https://registry.npmjs.org/",
        "https://registry.yarnpkg.com/"
      ]
    ]
  }
}
```

### Private Registry

Allow only your private registry:

```json
{
  "rules": {
    "lockfile/registry": ["error", "https://npm.internal.company.com/"]
  }
}
```

### Private Registry with Public Fallback

Allow both your private registry and the public npm registry:

```json
{
  "rules": {
    "lockfile/registry": [
      "error",
      [
        "https://npm.internal.company.com/",
        "https://registry.npmjs.org/"
      ]
    ]
  }
}
```

### Object Configuration with Package Patterns

For more granular control, you can use an object where keys are registry URLs and values are package name patterns (glob patterns, not regexes).

#### Default Registry for All Packages

Use `true` as the value to indicate a registry should be used for all packages (that don't match other patterns):

```json
{
  "rules": {
    "lockfile/registry": [
      "error",
      {
        "https://registry.npmjs.org/": true
      }
    ]
  }
}
```

**Note**: Only one registry can have the value `true`. The rule will error if multiple registries have `true`.

#### Private Registry for Specific Scoped Packages

Use glob patterns to match specific package names:

```json
{
  "rules": {
    "lockfile/registry": [
      "error",
      {
        "https://npm.internal.company.com/": "@company/*",
        "https://registry.npmjs.org/": true
      }
    ]
  }
}
```

This allows:
- All `@company/*` scoped packages from the private registry
- All other packages from the public npm registry

#### Multiple Patterns for a Registry

Use an array of glob patterns:

```json
{
  "rules": {
    "lockfile/registry": [
      "error",
      {
        "https://npm.internal.company.com/": ["@company/*", "@internal/*"],
        "https://registry.npmjs.org/": true
      }
    ]
  }
}
```

#### Complex Multi-Registry Setup

Combine multiple registries with different patterns:

```json
{
  "rules": {
    "lockfile/registry": [
      "error",
      {
        "https://npm.internal.company.com/": "@company/*",
        "https://npm.partner.example.com/": ["@partner/*", "partner-*"],
        "https://registry.npmjs.org/": true
      }
    ]
  }
}
```

This configuration:
- Requires all `@company/*` packages come from the internal registry
- Requires `@partner/*` and `partner-*` packages come from the partner registry
- Allows all other packages from the public npm registry

#### Pattern Precedence Rules

1. **Glob patterns have higher precedence than `true`**: If a package matches a glob pattern, it must use that pattern's registry, even if another registry has `true`.
2. **Only one pattern can match**: If a package matches multiple glob patterns (from different registries), the rule will error. Patterns must be mutually exclusive.
3. **Only one `true` allowed**: The configuration schema will error if multiple registries have the value `true`.

#### Glob Pattern Syntax

Patterns use [minimatch](https://www.npmjs.com/package/minimatch) syntax:

- `@company/*` - matches all packages in the `@company` scope
- `lodash` - matches exactly the `lodash` package
- `*-plugin` - matches any package ending with `-plugin`
- `babel-*` - matches any package starting with `babel-`
- `@types/*` - matches all DefinitelyTyped packages

#### Private Packages Only (No Public Registry)

You can omit `true` to disallow any packages that don't match your patterns:

```json
{
  "rules": {
    "lockfile/registry": [
      "error",
      {
        "https://npm.internal.company.com/": "@company/*"
      }
    ]
  }
}
```

This configuration only allows `@company/*` packages and will error on any other package.

## How Registry URLs Are Normalized

The rule normalizes registry URLs to ensure consistent comparison:

 - Trailing slashes are removed
 - Protocol and domain are compared case-insensitively
 - Paths are compared case-sensitively

Examples of equivalent registries:
 - `https://registry.npmjs.org` and `https://registry.npmjs.org/`
 - `https://REGISTRY.NPMJS.ORG` and `https://registry.npmjs.org`

## Why This Matters

Controlling which registries your dependencies come from is critical for security:

1. **Supply Chain Security**: Prevents packages from untrusted or compromised registries
2. **Registry Compromise**: Limits blast radius if a registry is compromised
3. **Corporate Policies**: Ensures compliance with organizational security policies
4. **Typosquatting Protection**: Prevents accidental use of malicious lookalike registries
5. **Audit Trail**: Makes it clear which registries are approved for use

### Attack Scenarios This Rule Prevents

- **Registry Hijacking**: Attackers take over a secondary registry
- **DNS Attacks**: Malicious DNS redirects to fake registries
- **Typosquatting**: Packages on lookalike registry domains
- **Man-in-the-Middle**: HTTP registries (rule requires https://)

## What Is Not Checked

This rule does **not** check:
 - Git dependencies (git: or git+https: URLs)
 - Local packages (file: protocol)
 - Packages without a `resolved` field
 - `bun.lock` text format (doesn't store registry URLs)
 - `vlt-lock.json` (doesn't store registry URLs)

## When Not To Use It

You might disable this rule if:

 - You frequently switch between different registries and don't want to update config each time
 - You're using a package manager that doesn't store registry URLs in lockfiles
 - You have another mechanism for ensuring registry security

However, for most projects, this rule should be enabled to maintain supply chain security.

## Further Reading

 - [npm registry documentation](https://docs.npmjs.com/cli/using-npm/registry)
 - [Using private npm registries](https://docs.npmjs.com/cli/using-npm/scope#associating-a-scope-with-a-registry)
 - [npm scoped packages](https://docs.npmjs.com/cli/using-npm/scope)
 - [Supply Chain Security Best Practices](https://github.blog/2020-09-02-secure-your-software-supply-chain-and-protect-against-supply-chain-threats-github-blog/)
 - [vlt documentation](https://github.com/vltpkg/vltpkg)
