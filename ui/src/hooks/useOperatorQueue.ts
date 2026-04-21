import { useNow } from '@/hooks/useNow'
import { toErrorMessage } from '@/lib/errors'
import { dashboardQueueQuery } from '@/lib/queries'
import type { OperatorQueue, QueueRunSummary } from '@/types'
import { OPERATOR_QUEUES } from '@/types'
import { useQuery } from '@tanstack/react-query'

const EMPTY_GROUPS: Record<OperatorQueue, QueueRunSummary[]> = OPERATOR_QUEUES.reduce(
	(acc, queue) => {
		acc[queue] = []
		return acc
	},
	{} as Record<OperatorQueue, QueueRunSummary[]>
)

export function useOperatorQueue() {
	const query = useQuery(dashboardQueueQuery())
	const refTime = useNow()

	const groups = query.data?.groups ?? EMPTY_GROUPS
	const totals: Record<OperatorQueue, number> = OPERATOR_QUEUES.reduce(
		(acc, queue) => {
			acc[queue] = groups[queue]?.length ?? 0
			return acc
		},
		{} as Record<OperatorQueue, number>
	)
	const actionable = totals['needs-human'] + totals['blocked-by-dependency']
	const totalInFlight = totals['in-pr'] + totals.waiting + totals.active + actionable

	return {
		loading: query.isLoading,
		error: toErrorMessage(query.error),
		generatedAt: query.data?.generated_at ?? null,
		refTime,
		refresh: query.refetch,
		groups,
		totals,
		actionable,
		totalInFlight
	}
}

export type OperatorQueueData = ReturnType<typeof useOperatorQueue>
