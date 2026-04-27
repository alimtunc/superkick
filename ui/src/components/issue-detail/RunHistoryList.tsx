import { RunHistoryRow } from '@/components/issue-detail/RunHistoryRow'
import type { LinkedRunSummary } from '@/types'

interface RunHistoryListProps {
	runs: LinkedRunSummary[]
	overflow: number
}

export function RunHistoryList({ runs, overflow }: RunHistoryListProps) {
	return (
		<div className="space-y-1">
			{runs.map((run) => (
				<RunHistoryRow key={run.id} run={run} />
			))}
			{overflow > 0 ? (
				<p className="font-data px-3 pt-2 text-[10px] text-dim">+{overflow} more</p>
			) : null}
		</div>
	)
}
