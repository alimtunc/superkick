import { useState } from 'react'

import { RunFilterBar } from '@/components/runs/RunFilterBar'
import { RunRow } from '@/components/runs/RunRow'
import { RunsHeader } from '@/components/runs/RunsHeader'
import { RunsSummary } from '@/components/runs/RunsSummary'
import { filterRuns, useRuns, type RunFilter } from '@/hooks/useRuns'

export function RunsPage() {
	const { runs, loading, error, refTime, refresh, classified, total } = useRuns()
	const [filter, setFilter] = useState<RunFilter>('all')

	const filtered = filterRuns(runs, filter, classified)

	return (
		<div>
			<RunsHeader
				total={total}
				activeCount={classified.active.length}
				loading={loading}
				lastRefresh={refTime}
				onRefresh={refresh}
			/>

			<div className="mx-auto flex max-w-5xl flex-col gap-8 px-5 py-8">
				{error ? <p className="font-data text-[11px] text-oxide">{error}</p> : null}

				<RunsSummary
					total={total}
					active={classified.active.length}
					completed={classified.completed.length}
					failed={classified.failed.length}
					needsAttention={classified.needsAttention.length}
				/>

				<RunFilterBar
					filter={filter}
					onFilter={setFilter}
					counts={{
						all: total,
						active: classified.active.length,
						completed: classified.completed.length,
						failed: classified.failed.length,
						cancelled: classified.cancelled.length
					}}
				/>

				{loading && runs.length === 0 ? (
					<p className="font-data py-10 text-center text-dim">Loading runs...</p>
				) : null}

				{!loading && filtered.length === 0 ? (
					<p className="font-data py-10 text-center text-dim">
						{total === 0 ? 'No runs yet. Start one from an issue.' : 'No runs match this filter.'}
					</p>
				) : null}

				{filtered.length > 0 ? (
					<div className="space-y-2">
						{filtered.map((run) => (
							<RunRow key={run.id} run={run} refTime={refTime} />
						))}
					</div>
				) : null}
			</div>
		</div>
	)
}
