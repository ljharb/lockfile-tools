# Enforce lockfile version (`lockfile/version`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

This rule enforces that lockfiles use specific versions for their format. Different lockfile versions have different capabilities, compatibility requirements, and may be required for certain Node.js or package manager versions.

Lockfile versions by package manager:

- **npm**: `1`, `2`, or `3` (default: `3`)
  - v1: Legacy format (npm 5.x)
  - v2: Introduced in npm 7 (deterministic, more secure)
  - v3: Current format (npm 7+)

- **yarn**: `1` or `2` (default: `2`)
  - v1: Classic Yarn (yarn.lock with `# yarn lockfile v1`)
  - v2: Yarn Berry/Modern (yarn.lock with `__metadata:`)

- **pnpm**: `'5.3'`, `'5.4'`, `'6.0'`, `'6.1'`, `'7.0'`, or `'9.0'` (default: `'9.0'`)
  - Different versions for different pnpm releases

- **bun**: `0` or `1` (default: `1`)
  - v0: Legacy binary format
  - v1: Current format

- **vlt**: `0` (default: `0`)
  - Only version 0 currently exists

Examples of **incorrect** code for this rule:

```json
// package-lock.json with version 2 when version 3 is required (default)
{
  "name": "my-project",
  "version": "1.0.0",
  "lockfileVersion": 2
  // ❌ Wrong version - expected 3
}
```

Examples of **correct** code for this rule:

```json
// package-lock.json with version 3 (default)
{
  "name": "my-project",
  "version": "1.0.0",
  "lockfileVersion": 3
  // ✅ Correct version
}
```

## Options

This rule accepts an object where each key is a package manager name and each value is the required version number (or `null` to skip checking that package manager).

<!-- begin auto-generated rule options list -->

| Name   |
| :----- |
| `bun`  |
| `npm`  |
| `pnpm` |
| `vlt`  |
| `yarn` |

<!-- end auto-generated rule options list -->

### Default Configuration

With no options, the rule uses the latest/recommended version for each package manager:

```json
{
  "rules": {
    "lockfile/version": "error"
  }
}
```

This is equivalent to:

```json
{
  "rules": {
    "lockfile/version": [
      "error",
      {
        "npm": 3,
        "yarn": 2,
        "pnpm": "9.0",
        "bun": 1,
        "vlt": 0
      }
    ]
  }
}
```

### Require npm lockfile v3

```json
{
  "rules": {
    "lockfile/version": ["error", { "npm": 3 }]
  }
}
```

### Allow npm v2 or v3

Use an array to allow multiple specific versions:

```json
{
  "rules": {
    "lockfile/version": ["error", { "npm": [2, 3] }]
  }
}
```

**Note**: This allows **only** versions 2 or 3. There are no "minimum" semantics - if you specify `[1]`, versions 2 and 3 are **not** permitted. Each version must be explicitly listed.

### Require Yarn Classic (v1)

```json
{
  "rules": {
    "lockfile/version": ["error", { "yarn": 1 }]
  }
}
```

### Require specific pnpm version

```json
{
  "rules": {
    "lockfile/version": ["error", { "pnpm": "7.0" }]
  }
}
```

### Skip checking a package manager

Use `null` to skip checking a specific package manager:

```json
{
  "rules": {
    "lockfile/version": [
      "error",
      {
        "npm": 3,
        "yarn": null,
        "pnpm": null,
        "bun": null,
        "vlt": null
      }
    ]
  }
}
```

### Mixed configuration

Different teams may use different package managers. Configure only the ones you use:

```json
{
  "rules": {
    "lockfile/version": [
      "error",
      {
        "npm": 3,
        "pnpm": "9.0"
      }
    ]
  }
}
```

### Allow multiple versions during migration

During a migration period, you might want to allow multiple versions:

```json
{
  "rules": {
    "lockfile/version": [
      "error",
      {
        "npm": [2, 3],
        "pnpm": ["7.0", "9.0"]
      }
    ]
  }
}
```

This allows npm lockfiles with version 2 or 3, and pnpm lockfiles with version 7.0 or 9.0 - useful when migrating between versions.

## How Versions Are Detected

### npm (package-lock.json, npm-shrinkwrap.json)

Reads the `lockfileVersion` field from the JSON file:

```json
{
  "lockfileVersion": 3
}
```

### yarn (yarn.lock)

Detects version from file format:
- v1: First line contains `# yarn lockfile v1`
- v2: First line contains `__metadata:`

### pnpm (pnpm-lock.yaml)

Reads the `lockfileVersion:` field from the YAML file:

```yaml
lockfileVersion: '9.0'
```

### bun (bun.lock, bun.lockb)

- `bun.lock` (JSON): Reads `lockfileVersion` field
- `bun.lockb` (binary): Converts to yarn.lock v1 format = version 0

### vlt (vlt-lock.json)

Reads the `lockfileVersion` field from the JSON file (currently only version 0 exists).

## Why This Matters

Enforcing lockfile versions provides several benefits:

1. **Team Consistency**: Ensures everyone uses the same lockfile format
2. **Tool Compatibility**: Prevents issues with incompatible package manager versions
3. **Feature Requirements**: Some features require specific lockfile versions
4. **CI/CD Reliability**: Prevents lockfile format mismatches in pipelines
5. **Upgrade Control**: Intentionally controls when lockfile format upgrades happen

### Version Differences

Different lockfile versions can have:
 - Different dependency resolution algorithms
 - Different security features (integrity checks, etc.)
 - Different workspace support
 - Different performance characteristics
 - Different size/storage requirements

## When Not To Use It

You might disable this rule if:

 - You're in the middle of migrating between package manager versions
 - You support multiple package manager versions across different projects
 - You don't care about lockfile version consistency

However, for most projects, enforcing a consistent lockfile version is valuable for team collaboration.

## Further Reading

 - [npm lockfileVersion documentation](https://docs.npmjs.com/cli/configuring-npm/package-lock-json#lockfileversion)
 - [Yarn versions](https://yarnpkg.com/getting-started/install)
 - [pnpm lockfile](https://pnpm.io/git#lockfiles)
 - [Bun lockfile](https://bun.sh/docs/install/lockfile)
 - [vlt documentation](https://github.com/vltpkg/vltpkg)
