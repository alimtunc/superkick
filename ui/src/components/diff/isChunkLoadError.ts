const CHUNK_ERROR_SIGNALS = [
	'loading chunk',
	'dynamically imported module',
	'mime type',
	'failed to fetch dynamically imported module',
	'importing a module script failed'
]

export function isChunkLoadError(error: unknown): boolean {
	if (!(error instanceof Error)) return false
	const haystack = `${error.name} ${error.message}`.toLowerCase()
	return CHUNK_ERROR_SIGNALS.some((signal) => haystack.includes(signal))
}
