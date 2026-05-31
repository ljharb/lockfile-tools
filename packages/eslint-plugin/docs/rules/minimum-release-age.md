# Disallow dependencies whose version was published more recently than a minimum release age (`lockfile/minimum-release-age`)

💼 This rule is enabled in the following configs: ✅ `recommended`, `recommended-legacy`.

<!-- end auto-generated rule header -->

## Rule Details

The window immediately after a version is published is the highest-risk period for a supply-chain attack. A compromised maintainer account or a malicious release does the most damage *before* the ecosystem (and automated scanners) have noticed and the version has been yanked - the "publish, get installed everywhere, get pulled hours later" pattern seen in recent self-propagating npm worms.

Refusing to adopt a version until it has aged past a short cooldown sharply reduces that exposure. This is the same protection pnpm's [`minimumReleaseAge`](https://pnpm.io/settings#minimumreleaseage) setting provides; this rule enforces it at lint time, for whatever resolved versions are already in your lockfile.

For each registry dependency in the lockfile, the rule asks the registry when that exact version was published, and reports it if it is younger than the threshold.

> **Note**
> This rule requires **network access** (or a warm npm cache), unlike the other rules - it queries the registry via [`pacote`](https://www.npmjs.com/package/pacote). It is reported under the same `recommended` config; disable it if you need fully offline linting.

It checks every supported lockfile - npm (`package-lock.json`, `npm-shrinkwrap.json`), yarn (`yarn.lock`), pnpm (`pnpm-lock.yaml`), and bun (`bun.lock`, `bun.lockb`) and vlt (`vlt-lock.json`) - extracting the resolved name+version of each registry dependency. Non-registry sources (git, tarball, file) are skipped.

## The threshold

The threshold is resolved, in order:

1. this rule's option, if given (a number of **minutes**);
2. otherwise the `minimum-release-age` setting in the nearest `.npmrc` (also minutes, matching pnpm);
3. otherwise a default of **one day** (1440 minutes).

## Options

This rule accepts a single number: the minimum age, in minutes, a resolved version must have before it is allowed.

```json
{
  "rules": {
    "lockfile/minimum-release-age": ["error", 4320]
  }
}
```

```js
// use the default (the `.npmrc` `minimum-release-age`, or one day)
'lockfile/minimum-release-age': 'error'

// require every resolved version to be at least 3 days old
'lockfile/minimum-release-age': ['error', 3 * 24 * 60]
```

## When Not To Use It

If you need linting to work fully offline, or you deliberately adopt brand-new releases immediately (and accept the risk), disable this rule. It can also be noisy right after you intentionally bump to a just-published version - in that case, wait, or pin until it ages.

## Further Reading

- [pnpm `minimumReleaseAge`](https://pnpm.io/settings#minimumreleaseage)
- [`pacote`](https://www.npmjs.com/package/pacote) - the registry client used to look up publish times
