/**
 * JSON AST helpers built on @humanwhocodes/momoa. Used to walk lockfile
 * JSON content (npm package-lock.json/npm-shrinkwrap.json, bun.lock,
 * vlt-lock.json) and extract package entries with accurate source line
 * numbers, replacing the regex-based `findJsonKeyLine`.
 */

import { parse } from '@humanwhocodes/momoa';

/** @import { ObjectNode } from '@humanwhocodes/momoa' */
/** @import {
 * parseJSON as ParseJSON,
 * getRootObject as GetRootObject,
 * memberKey as MemberKey,
 * findMember as FindMember,
 * getMember as GetMember,
 * getStringMember as GetStringMember,
 * getNumberMember as GetNumberMember,
 * getBooleanMember as GetBooleanMember,
 * nodeLine as NodeLine,
 * forEachMember as ForEachMember,
 * } from './json-ast.d.mts' */

/** @type {typeof ParseJSON} */
export function parseJSON(text) {
	return parse(text);
}

/** @type {typeof GetRootObject} */
export function getRootObject(doc) {
	return doc.body.type === 'Object'
		? /** @type {ObjectNode} */ (doc.body)
		: null;
}

/** @type {typeof MemberKey} */
export function memberKey(member) {
	return member.name.type === 'String' ? member.name.value : member.name.name;
}

/** @type {typeof FindMember} */
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

/** @type {typeof GetMember} */
export function getMember(obj, key) {
	const member = findMember(obj, key);
	return member ? member.value : null;
}

/** @type {typeof GetStringMember} */
export function getStringMember(obj, key) {
	const value = getMember(obj, key);
	return value && value.type === 'String' ? value.value : null;
}

/** @type {typeof GetNumberMember} */
export function getNumberMember(obj, key) {
	const value = getMember(obj, key);
	return value && value.type === 'Number' ? value.value : null;
}

/** @type {typeof GetBooleanMember} */
export function getBooleanMember(obj, key) {
	const value = getMember(obj, key);
	return value && value.type === 'Boolean' ? value.value : null;
}

/** @type {typeof NodeLine} */
export function nodeLine(node) {
	return node.loc.start.line;
}

/** @type {typeof ForEachMember} */
export function forEachMember(obj, fn) {
	if (obj && obj.type === 'Object') {
		for (let i = 0; i < obj.members.length; i++) {
			fn(obj.members[i], memberKey(obj.members[i]));
		}
	}
}
