# Disallow configuration that weakens lockfile and install integrity guarantees (`lockfile/no-weakening-config`)

💼 This rule is enabled in the following configs: ✅ `recommended`, `recommended-legacy`.

<!-- end auto-generated rule header -->

## Rule Details

A lockfile's integrity hashes are only worth anything if the installer actually verifies them over an authenticated transport, and a build-script allowlist is only worth anything if it is not globally overridden. Several package-manager settings quietly turn those protections off for *everyone* on the project. This rule flags them so they show up in review.

It reports the following settings in the nearest config file:

| File          | Setting                              | Why it is flagged                                                        |
| :------------ | :----------------------------------- | :----------------------------------------------------------------------- |
| `.npmrc`      | `strict-ssl=false`                   | disables TLS certificate verification for registry requests (MITM risk)  |
| `.npmrc`      | `verify-store-integrity=false`       | disables pnpm store-integrity verification                               |
| `.npmrc`      | `dangerously-allow-all-builds=true`  | lets every dependency run build/install scripts, defeating the allowlist |
| `.yarnrc.yml` | `checksumBehavior: ignore`           | disables yarn's package checksum verification                            |
| `.yarnrc.yml` | `enableStrictSsl: false`             | disables TLS certificate verification (MITM risk)                        |

`.npmrc` and `.yarnrc.yml` are resolved by walking up from the package directory to the repository root (the directory containing `.git`), matching how these tools resolve their own configuration. The nearest `.npmrc` wins.

## What is *not* checked

This rule deliberately does **not** cover the lockfile-*disabling* settings (`package-lock=false`, `lockfile=false`, bun's `save = false` under `[install.lockfile]`). Those are the domain of the [`tracked`](./tracked.md) rule, which uses them as the legitimate way to opt out of having a lockfile at all.

## When Not To Use It

If one of these settings is genuinely required in your environment (e.g. a corporate TLS-intercepting proxy that forces `strict-ssl=false`), you will need to disable this rule - ideally with an inline disable comment that documents why.

## Further Reading

- [npm config: `strict-ssl`](https://docs.npmjs.com/cli/configuring-npm/npmrc)
- [pnpm settings: `verify-store-integrity`, builds](https://pnpm.io/settings)
- [yarn `.yarnrc.yml`: `checksumBehavior`, `enableStrictSsl`](https://yarnpkg.com/configuration/yarnrc)
