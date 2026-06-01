import type { DocumentNode, ObjectNode, MemberNode, ValueNode } from '@humanwhocodes/momoa';

/** Parses JSON text into a momoa Document. Throws on malformed input (treat like a `JSON.parse` failure). */
export function parseJSON(text: string): DocumentNode;

/** The root Object node of a JSON document, or `null` if the document is not an object. */
export function getRootObject(doc: DocumentNode): ObjectNode | null;

/** The string key of a member node (handles both String and Identifier name nodes). */
export function memberKey(member: MemberNode): string;

/** The named member of an Object node, or `null`. */
export function findMember(obj: ValueNode | null | undefined, key: string): MemberNode | null;

/** The value node of a named member, or `null`. */
export function getMember(obj: ValueNode | null | undefined, key: string): ValueNode | null;

/** A String-typed member's primitive string value, or `null`. */
export function getStringMember(obj: ValueNode | null | undefined, key: string): string | null;

/** A Number-typed member's primitive number value, or `null`. */
export function getNumberMember(obj: ValueNode | null | undefined, key: string): number | null;

/** A Boolean-typed member's boolean value, or `null`. */
export function getBooleanMember(obj: ValueNode | null | undefined, key: string): boolean | null;

/** The 1-indexed source line where a node starts. */
export function nodeLine(node: { loc: { start: { line: number } } }): number;

/** Iterates every Member of an Object node; a no-op when `obj` is null/undefined or not an Object. */
export function forEachMember(obj: ValueNode | null | undefined, fn: (member: MemberNode, key: string) => void): void;
