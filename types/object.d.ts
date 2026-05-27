// Make `Object.keys`/`Object.entries` preserve the key union for objects with a
// known shape (`Object.keys({ a: 1 })` is `'a'[]`, not `string[]`), while
// falling back to `string` keys for index-signature / unknown-shape objects.
// This is intentionally less sound than the default lib typing - an object can
// carry keys beyond its declared type at runtime - but it removes the need to
// cast when the keys are statically known.
interface ObjectConstructor {
	keys<T extends object>(o: T): keyof T extends never ? string[] : Extract<keyof T, string>[];
	entries<T extends object>(o: T): [keyof T extends never ? string : Extract<keyof T, string>, T[keyof T]][];
}
