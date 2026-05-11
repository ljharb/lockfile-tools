/**
 * Per-process pacote manifest cache. Coalesces concurrent and repeat
 * calls across rules so each `name@version` is fetched once per lint
 * run; the `binary-conflicts` and `shrinkwrap` rules want different
 * subsets of the manifest, but both are satisfied by a single
 * `fullMetadata: true` fetch.
 */

import pacote from 'pacote';

/** @type {Map<string, Promise<import('pacote').Manifest>>} */
const inflight = new Map();

/**
 * @param {string} spec - `name@version` style pacote spec
 * @returns {Promise<import('pacote').Manifest>}
 */
export function getManifest(spec) {
	const existing = inflight.get(spec);
	if (existing) {
		return existing;
	}
	const p = pacote.manifest(spec, {
		preferOnline: false,
		fullMetadata: true,
	}).catch((e) => {
		// Don't poison the cache: a transient failure should be retryable.
		inflight.delete(spec);
		throw e;
	});
	inflight.set(spec, p);
	return p;
}
