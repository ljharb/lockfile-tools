/**
 * JSON AST helpers built on @humanwhocodes/momoa. Used to walk lockfile
 * JSON content (npm package-lock.json/npm-shrinkwrap.json, bun.lock,
 * vlt-lock.json) and extract package entries with accurate source line
 * numbers, replacing the regex-based `findJsonKeyLine`.
 */

import { parse } from '@humanwhocodes/momoa';

/** @typedef {import('@humanwhocodes/momoa').DocumentNode} DocumentNode */
/** @typedef {import('@humanwhocodes/momoa').ObjectNode} ObjectNode */
/** @typedef {import('@humanwhocodes/momoa').MemberNode} MemberNode */
/** @typedef {import('@humanwhocodes/momoa').ValueNode} ValueNode */

/**
 * Parse JSON text into a momoa Document. Throws on malformed input — callers
 * should treat that the same as JSON.parse failure.
 * @param {string} text
 * @returns {DocumentNode}
 */
export function parseJSON(text) {
	return parse(text);
}

/**
 * Returns the root Object node of a JSON document, or null if the document
 * is not an object.
 * @param {DocumentNode} doc
 * @returns {ObjectNode | null}
 */
export function getRootObject(doc) {
	return doc.body.type === 'Object' ? /** @type {ObjectNode} */ (doc.body) : null;
}

/**
 * Returns the string key of a member node (handles both String and
 * Identifier name nodes).
 * @param {MemberNode} member
 * @returns {string}
 */
export function memberKey(member) {
	return member.name.type === 'String'
		? member.name.value
		: member.name.name;
}

/**
 * Returns the named member of an Object node, or null.
 * @param {ValueNode | null | undefined} obj
 * @param {string} key
 * @returns {MemberNode | null}
 */
export function findMember(obj, key) {
	if (!obj || obj.type !== 'Object') {
		return null;
	}
	for (let i = 0; i < obj.members.length; i++) {
		if (memberKey(obj.members[i]) === key) {
			return obj.members[i];
		}
	}
	return null;
}

/**
 * Returns the value node of a named member, or null.
 * @param {ValueNode | null | undefined} obj
 * @param {string} key
 * @returns {ValueNode | null}
 */
export function getMember(obj, key) {
	const member = findMember(obj, key);
	return member ? member.value : null;
}

/**
 * Returns a primitive string for a String-typed member value, or null.
 * @param {ValueNode | null | undefined} obj
 * @param {string} key
 * @returns {string | null}
 */
export function getStringMember(obj, key) {
	const value = getMember(obj, key);
	return value && value.type === 'String' ? value.value : null;
}

/**
 * Returns a primitive number for a Number-typed member value, or null.
 * @param {ValueNode | null | undefined} obj
 * @param {string} key
 * @returns {number | null}
 */
export function getNumberMember(obj, key) {
	const value = getMember(obj, key);
	return value && value.type === 'Number' ? value.value : null;
}

/**
 * Returns the boolean for a Boolean-typed member value, or null.
 * @param {ValueNode | null | undefined} obj
 * @param {string} key
 * @returns {boolean | null}
 */
export function getBooleanMember(obj, key) {
	const value = getMember(obj, key);
	return value && value.type === 'Boolean' ? value.value : null;
}

/**
 * The 1-indexed source line where a node starts (matches the convention
 * used by the previous `findJsonKeyLine` helper).
 * @param {{ loc: { start: { line: number } } }} node
 * @returns {number}
 */
export function nodeLine(node) {
	return node.loc.start.line;
}

/**
 * Iterates every Member of an Object node. Returns nothing when the
 * argument is null/undefined or not an Object.
 * @param {ValueNode | null | undefined} obj
 * @param {(member: MemberNode, key: string) => void} fn
 */
export function forEachMember(obj, fn) {
	if (obj && obj.type === 'Object') {
		for (let i = 0; i < obj.members.length; i++) {
			fn(obj.members[i], memberKey(obj.members[i]));
		}
	}
}
