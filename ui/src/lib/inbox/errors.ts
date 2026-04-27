/**
 * Join two optional error messages into a single line. Both null → null,
 * one set → that one, both set → joined with a middle-dot. Used by Inbox
 * sections that aggregate errors from multiple TanStack queries.
 */
export function combineErrors(a: string | null, b: string | null): string | null {
	if (a && b) return `${a} · ${b}`
	return a ?? b
}
