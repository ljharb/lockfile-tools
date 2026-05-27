// `Array#includes` / `ReadonlyArray#includes` accept any value - so membership
// can be tested against a wider type without a cast - and narrow the searched
// value to the array's element type when they return `true`. This is
// intentionally looser than the default lib typing (which only accepts the
// element type), trading the "did you mean to search for that?" check for
// ergonomic membership tests + narrowing.
interface ReadonlyArray<T> {
	includes(searchElement: unknown, fromIndex?: number): searchElement is T;
}

interface Array<T> {
	includes(searchElement: unknown, fromIndex?: number): searchElement is T;
}
