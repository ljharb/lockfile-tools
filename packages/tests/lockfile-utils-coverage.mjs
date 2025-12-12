import test from 'tape';
import { extractPackageName } from 'lockfile-tools/lib/lockfile-utils.mjs';

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
