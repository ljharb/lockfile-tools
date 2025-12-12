# Packument Fixtures

This directory contains cached packument data for testing the `binary-conflicts` rule without requiring network access.

## Why Fixtures?

The `binary-conflicts` rule needs package manifest data to determine which packages provide which binaries. Instead of fetching this data from the npm registry during every test run, we cache the packument data as fixtures.

Benefits:
- Tests run offline
- Tests are faster
- Tests are more reliable (no network failures)
- Tests are deterministic (package data doesn't change)

## Adding a New Packument

To add packument data for a new package version:

```bash
npm run fetch-packument <package@version>
```

### Examples

```bash
npm run fetch-packument gulp@4.0.2
npm run fetch-packument gulp-cli@2.3.0
npm run fetch-packument tape@5.7.5
```

This will:
1. Fetch the package manifest from npm registry
2. Extract only the fields needed for testing (`name`, `version`, `bin`)
3. Save it as a JSON file in this directory

## Using Packuments in Tests

In your test file:

```javascript
import { createMockPacote } from './fixtures/packuments/loader.mjs';

// Create a mock pacote that returns fixtures for these packages
const mockedPacote = createMockPacote([
	'gulp@4.0.2',
	'gulp-cli@2.3.0',
	'tape@5.7.5',
]);

// Use with esmock to replace the real pacote
const rule = await esmock('../rules/binary-conflicts.mjs', {}, {
	pacote: mockedPacote,
});
```

## Current Fixtures

- `gulp-4.0.2.json` - gulp CLI tool
- `gulp-cli-2.3.0.json` - gulp CLI (conflicts with gulp)
- `tape-5.7.5.json` - tape test runner
- `eslint-8.57.0.json` - ESLint linter
- `mocha-10.0.0.json` - Mocha test framework (multiple binaries)
