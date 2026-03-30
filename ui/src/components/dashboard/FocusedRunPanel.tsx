import { fetchRun } from '@/api'
import { InterruptSummary } from '@/components/dashboard/InterruptSummary'
import { StepTimeline } from '@/components/run-detail/StepTimeline'
import { RunStateBadge } from '@/components/RunStateBadge'
import { Button } from '@/components/ui/button'
import { TERMINAL_STATES } from '@/lib/constants'
import { fmtElapsed } from '@/lib/domain'
import { queryKeys } from '@/lib/queryKeys'
import { useWatchedSessionsStore } from '@/stores/watchedSessions'
import type { Run } from '@/types'
import { useQuery, useQueryClient, skipToken } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'

export function FocusedRunPanel({ refTime }: { refTime: number }) {
	const focusedId = useWatchedSessionsStore((s) => s.focusedId)
	const clearFocus = useWatchedSessionsStore((s) => s.clearFocus)

	const queryClient = useQueryClient()
	const runsData = queryClient.getQueryData<Run[]>(queryKeys.runs.all)
	const focusedRun = runsData?.find((r) => r.id === focusedId) ?? null

	const isTerminal = focusedRun ? TERMINAL_STATES.has(focusedRun.state) : true

	const refetchInterval = isTerminal ? undefined : 10_000
	const query = useQuery({
		queryKey: queryKeys.runs.detail(focusedId ?? ''),
		queryFn: focusedId ? () => fetchRun(focusedId) : skipToken,
		refetchInterval
	})
	const data = query.data
	const loading = query.isLoading
	const queryError = query.error

	const error = queryError ? String(queryError) : null

	if (!focusedId || !focusedRun) return null

	return (
		<div className="border-b border-edge bg-carbon/40">
			<div className="mx-auto max-w-360 px-5 py-4">
				<div className="mb-3 flex items-center justify-between">
					<div className="flex items-center gap-3">
						<span className="font-data text-[9px] tracking-widest text-dim uppercase">
							Focused
						</span>
						<h2 className="text-sm font-medium text-fog">{focusedRun.issue_identifier}</h2>
						<RunStateBadge state={focusedRun.state} />
						<span className="font-data text-[10px] text-dim">{focusedRun.repo_slug}</span>
						<span className="font-data text-[10px] text-dim">
							{fmtElapsed(focusedRun.started_at, refTime)}
						</span>
					</div>
					<div className="flex items-center gap-2">
						<Link
							to="/runs/$runId"
							params={{ runId: focusedRun.id }}
							className="font-data rounded border border-edge px-2 py-0.5 text-[11px] text-silver transition-colors hover:border-edge-bright hover:text-fog"
						>
							FULL DETAIL
						</Link>
						<Button
							variant="ghost"
							size="icon-xs"
							onClick={clearFocus}
							className="font-data text-[11px] text-dim hover:text-silver"
							title="Close panel"
						>
							&times;
						</Button>
					</div>
				</div>

				{loading && !data?.run ? (
					<p className="font-data py-2 text-[11px] text-dim">Loading...</p>
				) : error ? (
					<p className="font-data py-2 text-[11px] text-oxide">{error}</p>
				) : data?.run ? (
					<div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr]">
						<div className="space-y-3">
							<dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
								<div>
									<dt className="font-data text-[9px] tracking-wider text-dim uppercase">
										Branch
									</dt>
									<dd className="font-data mt-0.5 text-silver">
										{data.run.branch_name ?? '--'}
									</dd>
								</div>
								<div>
									<dt className="font-data text-[9px] tracking-wider text-dim uppercase">
										Step
									</dt>
									<dd className="font-data mt-0.5 text-silver">
										{data.run.current_step_key ?? '--'}
									</dd>
								</div>
								<div>
									<dt className="font-data text-[9px] tracking-wider text-dim uppercase">
										Started
									</dt>
									<dd className="font-data mt-0.5 text-silver">
										{new Date(data.run.started_at).toLocaleTimeString()}
									</dd>
								</div>
								<div>
									<dt className="font-data text-[9px] tracking-wider text-dim uppercase">
										Trigger
									</dt>
									<dd className="font-data mt-0.5 text-silver">
										{data.run.trigger_source}
									</dd>
								</div>
							</dl>
							{data.run.error_message ? (
								<p className="font-data rounded border border-oxide/20 bg-oxide-dim p-2 text-[11px] text-oxide">
									{data.run.error_message}
								</p>
							) : null}
							{data.interrupts.length > 0 ? (
								<InterruptSummary interrupts={data.interrupts} />
							) : null}
						</div>
						<div>
							<span className="font-data mb-2 block text-[9px] tracking-wider text-dim uppercase">
								Steps
							</span>
							<StepTimeline steps={data.steps} />
						</div>
					</div>
				) : null}
			</div>
		</div>
	)
}
