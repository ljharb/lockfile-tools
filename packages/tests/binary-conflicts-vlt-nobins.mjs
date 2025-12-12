import test from 'tape';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import esmock from 'esmock';

// Mock pacote that returns packages without bins
const mockPacote = {
	/** @param {string} spec */
	async manifest(spec) {
		// Return a package without bins
		if (spec.includes('lodash')) {
			return {
				name: 'lodash',
				version: '4.17.21',
				// No bin field
			};
		}
		if (spec.includes('react')) {
			return {
				name: 'react',
				version: '18.0.0',
				// No bin field
			};
		}
		const err = /** @type {Error & { code?: string }} */ (new Error(`404 Not Found - ${spec}`));
		err.code = 'E404';
		throw err;
	},
};

const binaryConflictsRule = await esmock('eslint-plugin-lockfile/rules/binary-conflicts.mjs', {}, {
	pacote: mockPacote,
});

test('binary-conflicts rule - vlt lockfile with packages without bins', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: {
			lodash: '^4.0.0',
			react: '^18.0.0',
		},
	}));
	writeFileSync(join(tmpDir, 'vlt-lock.json'), JSON.stringify({
		nodes: {
			node1: ['4.17.21', 'lodash', 'sha512-abc123'],
			node2: ['18.0.0', 'react', 'sha512-def456'],
		},
	}));
	const testFile = join(tmpDir, 'index.js');
	writeFileSync(testFile, 'const x = 1;');

	/** @type {{ messageId?: string; data?: Record<string, unknown> }[]} */
	const reports = [];
	const context = {
		filename: testFile,
		/** @param {{messageId?: string; data?: Record<string, unknown> }} info */
		report(info) {
			reports.push(info);
		},
	};

	const ruleInstance = binaryConflictsRule.create(context);
	// eslint-disable-next-line new-cap
	await ruleInstance.Program({ type: 'Program' });

	t.equal(reports.length, 0, 'no errors when vlt packages have no bins');
	t.end();
});

test('binary-conflicts rule - vlt lockfile with malformed node (not array)', async (t) => {
	const tmpDir = mkdtempSync(join(tmpdir(), 'eslint-plugin-lockfile-test-'));
	t.teardown(() => rmSync(tmpDir, { recursive: true, force: true }));

	writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
		name: 'test',
		dependencies: {
			lodash: '^4.0.0',
		},
	}));
	writeFileSync(join(tmpDir, 'vlt-lock.json'), JSON.stringify({
		nodes: {
			node1: 'not-an-array', // Malformed node
			node2: ['4.17.21'], // Array but too short
		},
	}));
	const testFile = join(tmpDir, 'index.js');
	writeFileSync(testFile, 'const x = 1;');

	/** @type {{ messageId?: string; data?: Record<string, unknown> }[]} */
	const reports = [];
	const context = {
		filename: testFile,
		/** @param {{messageId?: string; data?: Record<string, unknown> }} info */
		report(info) {
			reports.push(info);
		},
	};

	const ruleInstance = binaryConflictsRule.create(context);
	// eslint-disable-next-line new-cap
	await ruleInstance.Program({ type: 'Program' });

	t.equal(reports.length, 0, 'no errors when vlt nodes are malformed');
	t.end();
});
