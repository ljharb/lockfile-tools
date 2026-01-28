import test from 'tape';
import { extractPackageName } from 'lockfile-tools/npm';
import { parseYarnLockfile, parsePnpmLockfile, createLockfileExtractor } from 'lockfile-tools/parsers';
import { extractRegistryFromUrl } from 'lockfile-tools/registry';

test('parseYarnLockfile - called with explicit fieldsToExtract (line 22 default arg)', (t) => {
	const content = 'tape@^5.0.0:\n  version "5.7.5"\n  resolved "https://example.com/tape.tgz"\n  integrity sha512-xxx\n';
	const entries = parseYarnLockfile(content, ['resolved', 'integrity']);

	t.equal(entries.length, 1, 'parses one entry');
	t.equal(entries[0].resolved, 'https://example.com/tape.tgz', 'extracts resolved');
	t.equal(entries[0].integrity, 'sha512-xxx', 'extracts integrity');
	t.end();
});

test('parseYarnLockfile - entry with empty resolved field (|| null fallback)', (t) => {
	// When resolved is not present, currentFields.resolved is undefined → || null gives null
	const content = 'tape@^5.0.0:\n  version "5.7.5"\n  integrity sha512-xxx\n';
	const entries = parseYarnLockfile(content);

	t.equal(entries.length, 1, 'parses one entry');
	t.equal(entries[0].resolved, null, 'resolved is null when not present');
	t.end();
});

test('parsePnpmLockfile - called with explicit fieldsToExtract (line 89 default arg)', (t) => {
	const content = 'lockfileVersion: \'9.0\'\n\npackages:\n  /tape@5.7.5:\n    resolution: {integrity: sha512-xxx, tarball: https://example.com/tape.tgz}\n';
	const entries = parsePnpmLockfile(content, ['tarball', 'integrity']);

	t.equal(entries.length, 1, 'parses one entry');
	t.equal(entries[0].resolved, 'https://example.com/tape.tgz', 'extracts tarball as resolved');
	t.equal(entries[0].integrity, 'sha512-xxx', 'extracts integrity');
	t.end();
});

test('parsePnpmLockfile - entry without tarball (|| null fallback on line 153)', (t) => {
	const content = 'lockfileVersion: \'9.0\'\n\npackages:\n  /tape@5.7.5:\n    resolution: {integrity: sha512-xxx}\n';
	const entries = parsePnpmLockfile(content);

	t.equal(entries.length, 1, 'parses one entry');
	t.equal(entries[0].resolved, null, 'resolved is null when tarball not present');
	t.equal(entries[0].integrity, 'sha512-xxx', 'integrity is extracted');
	t.end();
});

test('createLockfileExtractor - called with explicit null bunLockbExtractor (line 173 default arg)', (t) => {
	const extractor = createLockfileExtractor({}, null);

	t.equal(typeof extractor, 'function', 'returns a function');
	t.end();
});

test('extractRegistryFromUrl - URL with /-/ but no slash in pathBeforeTarball (line 32 false branch)', (t) => {
	// pathname is "/-/pkg-1.0.0.tgz", so pathBeforeTarball is empty string "", lastSlash === -1
	const result = extractRegistryFromUrl('https://example.com/-/pkg-1.0.0.tgz');

	// Falls through to the http(s) fallback: returns protocol + host
	t.equal(result, 'https://example.com', 'falls back to protocol + host when no slash in path before tarball');
	t.end();
});

test('extractPackageName - handles plain package name without node_modules', (t) => {
	const result = extractPackageName('lodash');
	t.equal(result, 'lodash', 'returns the package name as-is when not in node_modules format');
	t.end();
});

test('extractPackageName - handles scoped package in node_modules', (t) => {
	const result = extractPackageName('node_modules/@babel/core');
	t.equal(result, '@babel/core', 'extracts scoped package name');
	t.end();
});

test('extractPackageName - handles regular package in node_modules', (t) => {
	const result = extractPackageName('node_modules/lodash');
	t.equal(result, 'lodash', 'extracts regular package name');
	t.end();
});

test('extractPackageName - handles nested scoped packages', (t) => {
	const result = extractPackageName('node_modules/@babel/core/node_modules/@babel/helper');
	t.equal(result, '@babel/core', 'extracts first scoped package from nested path');
	t.end();
});
