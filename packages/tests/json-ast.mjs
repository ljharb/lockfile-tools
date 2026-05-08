import test from 'tape';
import {
	parseJSON,
	getRootObject,
	getMember,
	findMember,
	memberKey,
	getStringMember,
	getNumberMember,
	getBooleanMember,
	forEachMember,
	nodeLine,
} from 'lockfile-tools/json-ast';

test('parseJSON - returns a momoa Document for valid JSON', (t) => {
	const doc = parseJSON('{"x":1}');
	t.equal(doc.type, 'Document', 'root type is Document');
	t.equal(doc.body.type, 'Object', 'body is the parsed root value');
	t.end();
});

test('parseJSON - throws on malformed JSON', (t) => {
	t.throws(() => parseJSON('{ broken'), 'malformed JSON throws');
	t.end();
});

test('getRootObject - returns Object node for object root', (t) => {
	const root = getRootObject(parseJSON('{"x":1}'));
	t.ok(root, 'returned a root');
	t.equal(root && root.type, 'Object', 'root is the Object node');
	t.end();
});

test('getRootObject - returns null for non-object roots', (t) => {
	t.equal(getRootObject(parseJSON('[1,2,3]')), null, 'null for array root');
	t.equal(getRootObject(parseJSON('"hi"')), null, 'null for string root');
	t.equal(getRootObject(parseJSON('42')), null, 'null for number root');
	t.equal(getRootObject(parseJSON('null')), null, 'null for null root');
	t.end();
});

test('memberKey - reads String name', (t) => {
	const root = /** @type {NonNullable<ReturnType<typeof getRootObject>>} */ (getRootObject(parseJSON('{"foo":1}')));
	t.equal(memberKey(root.members[0]), 'foo', 'String key');
	t.end();
});

test('findMember / getMember - returns member by key, null when missing', (t) => {
	const root = getRootObject(parseJSON('{"a":1,"b":"hi"}'));
	const a = findMember(root, 'a');
	t.ok(a, 'found a');
	t.equal(a && memberKey(a), 'a', 'found member has key');
	t.equal(findMember(root, 'missing'), null, 'returns null for missing key');
	t.equal(findMember(null, 'a'), null, 'returns null for null receiver');
	const aValue = getMember(root, 'a');
	t.equal(aValue && aValue.type, 'Number', 'getMember returns the value node');
	t.equal(getMember(root, 'missing'), null, 'getMember returns null for missing');
	t.end();
});

test('getStringMember / getNumberMember / getBooleanMember - typed extraction', (t) => {
	const root = getRootObject(parseJSON('{"s":"hi","n":42,"b":true,"x":null}'));
	t.equal(getStringMember(root, 's'), 'hi', 'string value');
	t.equal(getStringMember(root, 'n'), null, 'number is not string');
	t.equal(getNumberMember(root, 'n'), 42, 'number value');
	t.equal(getNumberMember(root, 's'), null, 'string is not number');
	t.equal(getBooleanMember(root, 'b'), true, 'boolean value');
	t.equal(getBooleanMember(root, 'x'), null, 'null is not boolean');
	t.equal(getStringMember(root, 'missing'), null, 'missing key returns null');
	t.end();
});

test('forEachMember - iterates Object members in source order', (t) => {
	const root = getRootObject(parseJSON('{"a":1,"b":2,"c":3}'));
	/** @type {[string, unknown][]} */
	const seen = [];
	forEachMember(root, (member, key) => {
		const value = member.value.type === 'Number' ? member.value.value : null;
		seen.push([key, value]);
	});
	t.deepEqual(seen, [['a', 1], ['b', 2], ['c', 3]], 'iterates in order');
	t.end();
});

test('forEachMember - ignores non-Object input', (t) => {
	let count = 0;
	forEachMember(null, () => { count += 1; });
	forEachMember(undefined, () => { count += 1; });
	const arrayBody = parseJSON('[1,2,3]').body;
	forEachMember(arrayBody, () => { count += 1; });
	t.equal(count, 0, 'callback not invoked for null/undefined/non-Object');
	t.end();
});

test('nodeLine - returns 1-indexed start line', (t) => {
	const text = '{\n  "a": 1,\n  "b": 2\n}';
	const root = getRootObject(parseJSON(text));
	const a = findMember(root, 'a');
	const b = findMember(root, 'b');
	t.ok(a && b, 'both members found');
	if (a && b) {
		t.equal(nodeLine(a), 2, '"a" is on line 2');
		t.equal(nodeLine(b), 3, '"b" is on line 3');
	}
	t.end();
});
