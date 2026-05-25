export function stringifyForDisplay(value: unknown): string {
	if (value === null || value === undefined) return ''
	if (typeof value === 'string') return value
	try {
		return JSON.stringify(value, null, 2)
	} catch {
		return String(value)
	}
}
