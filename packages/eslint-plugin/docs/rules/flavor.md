# Enforce allowed lockfile formats (`lockfile/flavor`)

💼 This rule is enabled in the following configs: ✅ `recommended`, `recommended-legacy`.

<!-- end auto-generated rule header -->

## Rule Details

This rule enforces which lockfile formats are permitted in your project. It helps ensure consistency across team members and prevents accidental use of unintended package managers.

Supported package managers and their lockfiles:
- **npm**: `package-lock.json`, `npm-shrinkwrap.json`
- **yarn**: `yarn.lock`
- **pnpm**: `pnpm-lock.yaml`
- **bun**: `bun.lock`, `bun.lockb`
- **vlt**: `vlt-lock.json`

Examples of **incorrect** code for this rule with default options:

```js
// With default config (only npm allowed)
// ❌ Project contains yarn.lock
```

Examples of **correct** code for this rule with default options:

```js
// With default config (only npm allowed)
// ✅ Project only contains package-lock.json
```

## Options

This rule accepts either a string, or an array of strings and/or objects:

### String or Array of Strings

```json
{
  "rules": {
    "lockfile/flavor": ["error", "npm"]
  }
}
```

```json
{
  "rules": {
    "lockfile/flavor": ["error", ["npm", "yarn"]]
  }
}
```

Valid package manager names: `"npm"`, `"yarn"`, `"pnpm"`, `"bun"`, `"vlt"`

### Object Configuration

For more granular control, you can use objects with a `name` property (package manager name) and a `files` property:

- `files: true` - allows all lockfiles for that package manager
- `files: [...]` - array of specific lockfile names allowed

#### Single object (without array wrapper)

```json
{
  "rules": {
    "lockfile/flavor": [
      "error",
      {
        "name": "npm",
        "files": true
      }
    ]
  }
}
```

This allows all npm lockfiles (`package-lock.json` and `npm-shrinkwrap.json`).

#### Array of objects and/or strings

```json
{
  "rules": {
    "lockfile/flavor": [
      "error",
      [
        {
          "name": "npm",
          "files": ["package-lock.json"]
        },
        "yarn"
      ]
    ]
  }
}
```

This allows only `package-lock.json` from npm, and the default yarn lockfile (`yarn.lock`).

### Default Lockfiles

When using string configuration (e.g., `"npm"`), only the default lockfile for that package manager is allowed:

- **npm**: `package-lock.json` (excludes `npm-shrinkwrap.json`)
- **yarn**: `yarn.lock`
- **pnpm**: `pnpm-lock.yaml`
- **bun**: `bun.lock` (excludes `bun.lockb`)
- **vlt**: `vlt-lock.json`

To allow all lockfiles for a package manager, use the object configuration with `files: true`.

### Examples

#### Disallow all lockfiles (recommended for published packages)

```json
{
  "rules": {
    "lockfile/flavor": ["error", []]
  }
}
```

Published packages should not include lockfiles. Only applications should have lockfiles committed to version control. This configuration will report an error if any lockfile is present.

#### Allow only npm's package-lock.json (default)

```json
{
  "rules": {
    "lockfile/flavor": "error"
  }
}
```

#### Allow both npm lockfiles

```json
{
  "rules": {
    "lockfile/flavor": [
      "error",
      {
        "name": "npm",
        "files": true
      }
    ]
  }
}
```

#### Allow npm and yarn

```json
{
  "rules": {
    "lockfile/flavor": ["error", ["npm", "yarn"]]
  }
}
```

#### Allow specific lockfiles from multiple package managers

```json
{
  "rules": {
    "lockfile/flavor": [
      "error",
      [
        {
          "name": "npm",
          "files": ["npm-shrinkwrap.json"]
        },
        {
          "name": "bun",
          "files": ["bun.lockb"]
        }
      ]
    ]
  }
}
```

## When Not To Use It

If you don't care which package manager lockfiles are used in your project, or if you want to support multiple package managers without restriction, you can disable this rule.

## Further Reading

- [npm package-lock.json documentation](https://docs.npmjs.com/cli/configuring-npm/package-lock-json)
- [Yarn lockfiles](https://classic.yarnpkg.com/en/docs/yarn-lock/)
- [pnpm lockfiles](https://pnpm.io/git#lockfiles)
- [Bun lockfiles](https://bun.sh/docs/install/lockfile)
- [vlt documentation](https://github.com/vltpkg/vltpkg)
