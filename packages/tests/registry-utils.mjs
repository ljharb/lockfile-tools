import test from 'tape';
import { normalizeRegistry, extractRegistryFromUrl } from 'lockfile-tools/registry';

test('normalizeRegistry', (t) => {
	t.equal(normalizeRegistry('https://registry.npmjs.org/'), 'https://registry.npmjs.org', 'removes trailing slash');
	t.equal(normalizeRegistry('https://registry.npmjs.org'), 'https://registry.npmjs.org', 'handles no trailing slash');
	t.end();
});

test('extractRegistryFromUrl - standard registry URLs', (t) => {
	t.equal(
		extractRegistryFromUrl('https://registry.npmjs.org/tape/-/tape-5.7.5.tgz'),
		'https://registry.npmjs.org',
		'extracts registry from standard npm tarball URL',
	);
	t.equal(
		extractRegistryFromUrl('https://registry.yarnpkg.com/tape/-/tape-5.7.5.tgz'),
		'https://registry.yarnpkg.com',
		'extracts registry from yarn registry tarball URL',
	);
	t.end();
});

test('extractRegistryFromUrl - scoped packages on standard registry', (t) => {
	t.equal(
		extractRegistryFromUrl('https://registry.npmjs.org/@scope/package/-/package-1.0.0.tgz'),
		'https://registry.npmjs.org',
		'extracts registry from scoped package on standard registry',
	);
	t.end();
});

test('extractRegistryFromUrl - path-based registries (Artifactory, GitLab)', (t) => {
	t.equal(
		extractRegistryFromUrl('https://artifacts.company.net/api/npm/npm-company/tape/-/tape-5.7.5.tgz'),
		'https://artifacts.company.net/api/npm/npm-company',
		'extracts registry from Artifactory-style path-based URL',
	);
	t.equal(
		extractRegistryFromUrl('https://gitlab.com/api/v4/projects/123/packages/npm/package/-/package-1.0.0.tgz'),
		'https://gitlab.com/api/v4/projects/123/packages/npm',
		'extracts registry from GitLab-style path-based URL',
	);
	t.equal(
		extractRegistryFromUrl('https://example.com/custom/path/to/registry/pkg/-/pkg-2.0.0.tgz'),
		'https://example.com/custom/path/to/registry',
		'extracts registry from custom path-based URL',
	);
	t.end();
});

test('extractRegistryFromUrl - scoped packages on path-based registries', (t) => {
	t.equal(
		extractRegistryFromUrl('https://artifacts.company.net/api/npm/npm-company/@scope/pkg/-/pkg-1.0.0.tgz'),
		'https://artifacts.company.net/api/npm/npm-company',
		'extracts registry from scoped package on Artifactory',
	);
	t.equal(
		extractRegistryFromUrl('https://gitlab.com/api/v4/projects/123/packages/npm/@org/library/-/library-3.0.0.tgz'),
		'https://gitlab.com/api/v4/projects/123/packages/npm',
		'extracts registry from scoped package on GitLab',
	);
	t.end();
});

test('extractRegistryFromUrl - fallback for non-standard URLs', (t) => {
	// URLs without /-/ separator fall back to protocol + host
	t.equal(
		extractRegistryFromUrl('https://example.com/some/random/path.tgz'),
		'https://example.com',
		'falls back to host for URL without /-/ separator',
	);
	t.equal(
		extractRegistryFromUrl('https://cdn.example.com/packages/foo-1.0.0.tgz'),
		'https://cdn.example.com',
		'falls back to host for CDN-style URLs',
	);
	t.end();
});

test('extractRegistryFromUrl - invalid URLs', (t) => {
	t.equal(extractRegistryFromUrl('not-a-url'), null, 'returns null for invalid URL');
	t.equal(extractRegistryFromUrl(''), null, 'returns null for empty string');
	t.end();
});

test('extractRegistryFromUrl - edge cases', (t) => {
	// URL with /-/ at root level (package name directly after host)
	t.equal(
		extractRegistryFromUrl('https://registry.npmjs.org/pkg/-/pkg-1.0.0.tgz'),
		'https://registry.npmjs.org',
		'handles package at root level',
	);
	// Multiple dashes in package name
	t.equal(
		extractRegistryFromUrl('https://registry.npmjs.org/my-long-package-name/-/my-long-package-name-1.0.0.tgz'),
		'https://registry.npmjs.org',
		'handles package names with multiple dashes',
	);
	t.end();
});
