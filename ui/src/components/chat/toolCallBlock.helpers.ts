export function safeStringify(value: unknown, pretty = true): string {
	if (value === null || value === undefined) return ''
	if (typeof value === 'string') return value
	try {
		return JSON.stringify(value, null, pretty ? 2 : 0)
	} catch {
		return String(value)
	}
}
