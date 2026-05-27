# Require lockfiles to be tracked in version control, or disabled in config (`lockfile/tracked`)

<!-- end auto-generated rule header -->

## Rule Details

On any given project, *everyone* should be using the same lockfile, or *no one* should be. A lockfile that exists on a developer's disk but is excluded from version control (via `.gitignore`) is the worst of both worlds: some contributors have it and some don't, so installs are no longer reproducible across the team.

This rule enforces that consistency:

- **If a lockfile exists on disk, it must be tracked in version control.** “Tracked” is approximated by checking that the lockfile is *not* matched by any applicable `.gitignore` (using the [`ignore`](https://www.npmjs.com/package/ignore) package, with the same semantics git uses). A lockfile that git would ignore is not shared with everyone, so it is reported.
- **If no lockfile exists, the package manager must be configured not to produce one.** Otherwise, the next person to run an install would silently create an untracked lockfile. The disabling config differs per package manager (see below).

The rule runs against `package.json`, so it fires whether or not a lockfile is present.

### Applications vs. published packages

The recommended resolution depends on what kind of project this is, inferred from `package.json`'s `private` field:

- **Applications** (`"private": true`) should **commit a lockfile**, so every contributor and deploy uses identical dependencies.
- **Published packages** (libraries; not `private`) should **not use a lockfile** - the lockfile is irrelevant to consumers, insulates maintainers from supply chain issues their consumers endure, and adds noise - so they should disable lockfile generation instead.

The error messages lead with the appropriate recommendation, but both resolutions are always valid; the rule only requires that you pick one.

## Disabling lockfile generation

| Package manager | Lockfile(s)                                  | Config to disable                                   |
| :-------------- | :------------------------------------------- | :-------------------------------------------------- |
| npm             | `package-lock.json`, `npm-shrinkwrap.json`   | `package-lock=false` in `.npmrc`                    |
| pnpm            | `pnpm-lock.yaml`                              | `lockfile=false` in `.npmrc`                        |
| bun             | `bun.lock`, `bun.lockb`                       | `save = false` under `[install.lockfile]` in `bunfig.toml` |
| yarn            | `yarn.lock`                                  | *(no supported option - see below)*                |
| vlt             | `vlt-lock.json`                              | *(no supported option - see below)*                |

`.npmrc` and `bunfig.toml` are resolved by walking up from the package directory to the repository root (the directory containing `.git`), matching how these tools resolve their own configuration.

yarn and vlt have no supported option to disable lockfile generation. For those package managers, only the “must be tracked if present” half is enforced - a present-but-ignored `yarn.lock`/`vlt-lock.json` is reported, but an absent one is not (there is nothing to require, since you can neither disable it nor commit one without running an install).

## Options

This rule accepts a single package-manager name, or an array of names, identifying the package manager(s) the project uses. The default is `"npm"`.

```json
{
  "rules": {
    "lockfile/tracked": ["error", "npm"]
  }
}
```

```json
{
  "rules": {
    "lockfile/tracked": ["error", ["npm", "yarn"]]
  }
}
```

Valid names: `"npm"`, `"yarn"`, `"pnpm"`, `"bun"`, `"vlt"`.

## Usage

Unlike the other rules, this one is scoped to `package.json` rather than to the lockfiles - it has to run even when no lockfile is present. `package.json` is JSON, not JavaScript, so the config block needs a parser that does not choke on it: point the block at `package.json` and use a JSON-tolerant parser.

```js
// eslint.config.js
import lockfile from 'eslint-plugin-lockfile';

export default [
	{
		files: ['**/package.json'],
		plugins: { lockfile },
		languageOptions: { parser: /* a parser that accepts JSON */ },
		rules: {
			'lockfile/tracked': ['error', 'npm'],
		},
	},
];
```

## When Not To Use It

If you intentionally allow some contributors to keep a local-only lockfile, or you don't need lockfile usage to be consistent across your team, you can disable this rule.

## Further Reading

- [`ignore`](https://www.npmjs.com/package/ignore) - the gitignore matcher used to detect untracked lockfiles
- [npm `package-lock` config](https://docs.npmjs.com/cli/configuring-npm/npmrc)
- [pnpm `lockfile` setting](https://pnpm.io/settings#lockfile)
- [bun `install.lockfile` config](https://bun.sh/docs/runtime/bunfig#install-lockfile)
