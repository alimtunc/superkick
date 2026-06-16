export function toErrorMessage(error: unknown): string | null {
	if (!error) return null
	if (error instanceof Error) return error.message
	return String(error)
}

/**
 * Same as `toErrorMessage` but always returns a string by falling back to a
 * generic label. Use at UI leaves that need to render *something*.
 */
export function errorMessageOr(error: unknown, fallback = 'Unknown error'): string {
	return toErrorMessage(error) ?? fallback
}
