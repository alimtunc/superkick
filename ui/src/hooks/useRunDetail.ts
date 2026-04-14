import { useMemo, useState, useEffect, useCallback } from 'react'

import { cancelRun, fetchRun } from '@/api'
import { TERMINAL_STATES } from '@/lib/constants'
import { shouldShowInterrupts } from '@/lib/domain'
import { queryKeys } from '@/lib/queryKeys'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'

export function useRunDetail(runId: string) {
	const queryClient = useQueryClient()

	const {
		data,
		isLoading: loading,
		error: queryError,
		refetch
	} = useQuery({
		queryKey: queryKeys.runs.detail(runId),
		queryFn: () => fetchRun(runId)
	})

	const error = queryError ? String(queryError) : null
	const run = data?.run ?? null
	const steps = data?.steps ?? []
	const sessions = data?.sessions ?? []
	const interrupts = data?.interrupts ?? []
	const attentionRequests = data?.attention_requests ?? []
	const pr = data?.pr ?? null

	const syncRun = useCallback(() => {
		queryClient.invalidateQueries({ queryKey: queryKeys.runs.detail(runId) })
	}, [queryClient, runId])

	// Cancel run
	const [cancelConfirm, setCancelConfirm] = useState(false)

	const cancelMutation = useMutation({
		mutationFn: () => cancelRun(runId),
		onSuccess: () => {
			setCancelConfirm(false)
			syncRun()
		},
		onError: () => setCancelConfirm(false)
	})

	useEffect(() => {
		if (!cancelConfirm) return
		const timer = setTimeout(() => setCancelConfirm(false), 4000)
		return () => clearTimeout(timer)
	}, [cancelConfirm])

	const isTerminal = useMemo(() => (run ? TERMINAL_STATES.has(run.state) : false), [run])

	const showInterrupts = useMemo(
		() => (run ? shouldShowInterrupts(run.state, interrupts.length) : false),
		[run, interrupts.length]
	)

	return {
		run,
		steps,
		sessions,
		interrupts,
		attentionRequests,
		pr,
		loading,
		error,
		isTerminal,
		showInterrupts,
		refresh: refetch,
		syncRun,
		cancelConfirm,
		setCancelConfirm,
		cancelling: cancelMutation.isPending,
		handleCancel: () => cancelMutation.mutate()
	}
}
