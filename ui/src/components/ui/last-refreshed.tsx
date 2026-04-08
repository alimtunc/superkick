function formatElapsed(ms: number): string {
	const seconds = Math.floor(ms / 1000)
	if (seconds < 5) return 'just now'
	if (seconds < 60) return `${seconds}s ago`
	const minutes = Math.floor(seconds / 60)
	if (minutes < 60) return `${minutes}m ago`
	const hours = Math.floor(minutes / 60)
	return `${hours}h ago`
}

export function useLastRefreshed(at: Date | number | null, loading?: boolean): string | null {
	if (at == null) return null
	if (loading) return 'refreshing…'

	const ts = typeof at === 'number' ? at : at.getTime()
	return formatElapsed(Date.now() - ts)
}
