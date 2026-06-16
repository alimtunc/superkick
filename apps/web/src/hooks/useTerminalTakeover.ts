import { useCallback } from 'react'

import { closeTakeover, fetchTakeoverModes, listActiveTakeovers, openTakeover } from '@/api'
import { queryKeys } from '@/lib/queryKeys'
import type { ActiveTakeoversResponse, OpenTakeoverRequest } from '@/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export function useTakeoverModes(runId: string, enabled: boolean) {
	return useQuery({
		queryKey: queryKeys.terminalTakeover.modes(runId),
		queryFn: () => fetchTakeoverModes(runId),
		enabled: enabled && Boolean(runId),
		staleTime: 5_000
	})
}

export function useActiveTakeovers(runId: string, enabled: boolean) {
	return useQuery({
		queryKey: queryKeys.terminalTakeover.active(runId),
		queryFn: () => listActiveTakeovers(runId),
		enabled: enabled && Boolean(runId),
		// Active takeovers can change without an explicit user action (the
		// child may exit). Refresh every 10s while the section is mounted.
		refetchInterval: 10_000,
		staleTime: 0
	})
}

export function useOpenTakeover(runId: string) {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (body: OpenTakeoverRequest) => openTakeover(runId, body),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.terminalTakeover.modes(runId) })
			queryClient.invalidateQueries({ queryKey: queryKeys.terminalTakeover.active(runId) })
			queryClient.invalidateQueries({ queryKey: queryKeys.runs.detail(runId) })
		}
	})
}

export function useCloseTakeover(runId: string) {
	const queryClient = useQueryClient()
	const mutation = useMutation({
		mutationFn: (takeoverSessionId: string) => closeTakeover(runId, takeoverSessionId),
		onSuccess: (_data, takeoverSessionId) => {
			// Drop the closed takeover from the cache synchronously so the
			// auto-restore effect doesn't re-mount it during the brief window
			// before the refetch resolves.
			queryClient.setQueryData<ActiveTakeoversResponse>(
				queryKeys.terminalTakeover.active(runId),
				(prev) =>
					prev
						? {
								takeovers: prev.takeovers.filter(
									(t) => t.takeover_session_id !== takeoverSessionId
								)
							}
						: prev
			)
			queryClient.invalidateQueries({ queryKey: queryKeys.terminalTakeover.modes(runId) })
			queryClient.invalidateQueries({ queryKey: queryKeys.terminalTakeover.active(runId) })
			queryClient.invalidateQueries({ queryKey: queryKeys.runs.detail(runId) })
		}
	})

	const close = useCallback(
		(takeoverSessionId: string) => mutation.mutateAsync(takeoverSessionId),
		[mutation]
	)

	return { close, pending: mutation.isPending, error: mutation.error }
}
