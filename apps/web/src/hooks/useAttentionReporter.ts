import { useEffect } from 'react'

import { useOperatorQueue } from '@/hooks/useOperatorQueue'
import { isDesktopShell, reportDesktopAttention } from '@/lib/desktop'
import { activeDesktopProject, desktopProjectsQuery } from '@/lib/desktopProjects'
import { useQuery, useQueryClient } from '@tanstack/react-query'

/** Mirrors the active project's actionable count into the desktop registry for rail badges. */
export function useAttentionReporter() {
	const { actionable, loading, error } = useOperatorQueue()
	const queryClient = useQueryClient()
	const { data } = useQuery({ ...desktopProjectsQuery(), enabled: isDesktopShell() })
	const active = activeDesktopProject(data)
	const activeId = active?.id ?? null
	const cachedCount = active?.attention_count ?? null

	useEffect(() => {
		// !loading keeps a booting dashboard from wiping a real badge with 0
		if (!isDesktopShell() || loading || error !== null || !activeId) return
		if (cachedCount === actionable) return
		reportDesktopAttention(activeId, actionable)
			.then(() => queryClient.invalidateQueries({ queryKey: desktopProjectsQuery().queryKey }))
			.catch(console.error)
	}, [actionable, loading, error, activeId, cachedCount, queryClient])
}
