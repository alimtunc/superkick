import { fmtRelativeTime } from '@/lib/domain/formatters'

export function useLastRefreshed(at: Date | number | null, loading?: boolean): string | null {
	if (at == null) return null
	if (loading) return 'refreshing…'

	const iso = typeof at === 'number' ? new Date(at).toISOString() : at.toISOString()
	return fmtRelativeTime(iso)
}
