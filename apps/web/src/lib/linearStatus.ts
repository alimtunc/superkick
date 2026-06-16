import type { PillTone, ViewerResponse } from '@/types'

export function linearStatusDisplay(
	viewer: ViewerResponse | null,
	loading: boolean
): { label: string; tone: PillTone } {
	if (viewer) return { label: `connected as ${viewer.name}`, tone: 'success' }
	if (loading) return { label: 'checking…', tone: 'neutral' }
	return { label: 'not connected', tone: 'warn' }
}
