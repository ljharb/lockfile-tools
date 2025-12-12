# Enforce integrity values in lockfiles (`lockfile/integrity`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

This rule ensures that every package in your lockfiles includes an integrity hash value, that the value is in a valid format, and that the hash is actually correct.
Integrity hashes are critical for security as they verify that downloaded packages haven't been tampered with.

The rule verifies hash correctness against npm's local cache.
**If a package is not in the cache and correctness cannot be verified, the rule will report an error.**
This ensures that all integrity hashes are always verified before allowing code to pass linting.

The rule checks all known versions of all lockfile formats:
- `package-lock.json` / `npm-shrinkwrap.json`
- `yarn.lock`
- `pnpm-lock.yaml`
- `bun.lock` / `bun.lockb`
- `vlt-lock.json`

Examples of **incorrect** code for this rule:

```json
// package-lock.json with missing integrity
{
  "packages": {
    "node_modules/example": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/example/-/example-1.0.0.tgz"
      // ❌ Missing integrity field
    }
  }
}
```

```json
// package-lock.json with invalid integrity format
{
  "packages": {
    "node_modules/example": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/example/-/example-1.0.0.tgz",
      "integrity": "invalid-hash-format"
      // ❌ Invalid integrity format
    }
  }
}
```

```json
// package-lock.json with incorrect integrity hash
{
  "packages": {
    "node_modules/example": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/example/-/example-1.0.0.tgz",
      "integrity": "sha512-wronghashvaluehere=="
      // ❌ Hash doesn't match actual tarball content
    }
  }
}
```

Examples of **correct** code for this rule:

```json
// package-lock.json with valid integrity
{
  "packages": {
    "node_modules/example": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/example/-/example-1.0.0.tgz",
      "integrity": "sha512-abc123..."
      // ✅ Valid SHA-512 integrity hash
    }
  }
}
```

```yaml
# yarn.lock with valid integrity
example@^1.0.0:
  version "1.0.0"
  resolved "https://registry.npmjs.org/example/-/example-1.0.0.tgz"
  integrity sha512-abc123...
  # ✅ Valid integrity hash
```

## Options

This rule accepts an optional array of allowed hashing algorithms.

### Default Configuration

By default, all algorithms are allowed:

```json
{
  "rules": {
    "lockfile/integrity": "error"
  }
}
```

This is equivalent to:

```json
{
  "rules": {
    "lockfile/integrity": ["error", ["sha1", "sha256", "sha384", "sha512"]]
  }
}
```

### Restrict to Secure Algorithms Only

For better security, you can disallow weak algorithms like SHA-1:

```json
{
  "rules": {
    "lockfile/integrity": ["error", ["sha256", "sha384", "sha512"]]
  }
}
```

This configuration will report an error if any package uses SHA-1 hashes.

### Require Only SHA-512

For maximum security, you can require only SHA-512:

```json
{
  "rules": {
    "lockfile/integrity": ["error", ["sha512"]]
  }
}
```

**Note**: SHA-512 is the recommended algorithm and is used by default in modern versions of npm, yarn, and pnpm.

### Algorithm Security Considerations

- **SHA-1**: Considered weak and vulnerable to collision attacks. Not recommended for new projects.
- **SHA-256**: Secure and widely supported. Good choice for most projects.
- **SHA-384**: More secure than SHA-256, less common.
- **SHA-512**: Most secure, recommended for high-security applications. Default in modern package managers.

## What This Rule Checks

This rule always enforces that:

1. All registry-hosted packages must have an integrity value
2. Integrity values must be in valid format: `sha1-*`, `sha256-*`, `sha384-*`, or `sha512-*`
3. Integrity algorithms must be in the allowed list (configurable, defaults to all algorithms)
4. Integrity hashes must be correct (verified against npm's cache)

### Integrity Presence

The rule reports an error when:
 - A package has a `resolved` URL pointing to a registry (http/https)
 - But the `integrity` field is missing, null, or incorrect

### Integrity Format

The rule validates that integrity values match the pattern:
```
(sha1|sha256|sha384|sha512)-[base64-encoded-hash]
```

Valid formats:
 - `sha1-[hash]` - SHA-1 (legacy, not recommended)
 - `sha256-[hash]` - SHA-256
 - `sha384-[hash]` - SHA-384
 - `sha512-[hash]` - SHA-512 (recommended)

### What Is Not Checked

The rule does **not** check:
 - Local packages (file: protocol)
 - Git dependencies (git: or git+https: protocol)
 - Workspace packages
 - Packages without a `resolved` field

**Note**: For packages with registry URLs, hash correctness is **always** verified. If a package is not in npm's cache and cannot be verified, the rule will report an error to ensure security.

## Why Integrity Matters

Integrity hashes provide several important security guarantees:

1. **Tamper Detection**: Ensures the downloaded package matches what was published
2. **Registry Compromise Protection**: Protects against malicious package replacement
3. **Network Attack Prevention**: Prevents man-in-the-middle attacks during download
4. **Reproducible Builds**: Guarantees the same exact code is installed across environments

Without integrity hashes, your application is vulnerable to:
 - Compromised package registries
 - Network-level attacks
 - Accidental package corruption
 - Supply chain attacks

## When Not To Use It

You should almost never disable this rule. The only valid reasons would be:

 - Working with a legacy lockfile that needs to be regenerated
 - Using a custom registry that doesn't support integrity hashes (you should fix the registry instead)
 - Temporarily during migration (re-enable as soon as possible)

## Further Reading

 - [npm integrity documentation](https://docs.npmjs.com/cli/configuring-npm/package-lock-json#integrity)
 - [Subresource Integrity (SRI) specification](https://www.w3.org/TR/SRI/)
 - [npm Security Best Practices](https://docs.npmjs.com/packages-and-modules/securing-your-code)
 - [Supply Chain Security](https://github.blog/2020-09-02-secure-your-software-supply-chain-and-protect-against-supply-chain-threats-github-blog/)
 - [vlt documentation](https://github.com/vltpkg/vltpkg)
