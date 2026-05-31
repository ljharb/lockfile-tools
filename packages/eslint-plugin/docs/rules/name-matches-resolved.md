# Enforce that a package's resolved registry URL matches its name (`lockfile/name-matches-resolved`)

💼 This rule is enabled in the following configs: ✅ `recommended`, `recommended-legacy`.

<!-- end auto-generated rule header -->

## Rule Details

npm registry tarball URLs follow a fixed convention:

```
{registry}/{name}/-/{name}-{version}.tgz
```

Because the package name appears in the URL, it can be recovered from the `resolved`/`resolution` field and compared against the name the lockfile records that entry under. If they disagree - for example, an entry keyed `lodash` whose `resolved` URL points at a tarball for some other package - the lockfile has been tampered with or hand-edited incorrectly, and an ordinary install would silently fetch the wrong code under a trusted name.

This is a [lockfile-poisoning](https://medium.com/node-js-cybersecurity/lockfile-poisoning-and-how-hashes-verify-integrity-in-node-js-lockfiles-0f105a6a18cd) / dependency-substitution vector: the integrity hash still matches the (malicious) tarball the URL points at, so the `integrity` rule alone would not catch it. The defense is to require the name in the URL to match the name in the lockfile.

The rule reports a package when:

- its `resolved` URL is a registry tarball URL (contains the `/-/` separator), **and**
- the package name encoded in that URL differs from the name the lockfile keys it under.

## What is *not* checked

- **Non-registry sources** (git, GitHub, plain tarball, and `file:` specifiers) have no `/-/` name convention, so they are skipped here - that is the job of the [`non-registry-specifiers`](./non-registry-specifiers.md) rule.
- **pnpm, `bun.lock`, and `vlt-lock.json`** record only an integrity hash (not a per-package registry tarball URL) for registry dependencies, so there is no URL whose name could be compared. These formats are skipped. npm (`package-lock.json`, `npm-shrinkwrap.json`), `yarn.lock`, and `bun.lockb` (which decodes to the yarn format) are checked.

## When Not To Use It

This rule should essentially always be on; a name/URL mismatch has no legitimate use. If you vendor packages under deliberately renamed registry paths, you may need to disable it.

## Further Reading

- [Lockfile poisoning](https://medium.com/node-js-cybersecurity/lockfile-poisoning-and-how-hashes-verify-integrity-in-node-js-lockfiles-0f105a6a18cd)
- [`non-registry-specifiers`](./non-registry-specifiers.md) - the companion rule for non-registry sources
