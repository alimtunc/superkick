import { AlertRow } from '@/components/dashboard/AlertRow'
import { BoardCol } from '@/components/dashboard/BoardCol'
import { CompletedTable } from '@/components/dashboard/CompletedTable'
import { DistPanel } from '@/components/dashboard/DistPanel'
import { DurationRow } from '@/components/dashboard/DurationRow'
import { FocusedRunPanel } from '@/components/dashboard/FocusedRunPanel'
import { KpiCell } from '@/components/dashboard/KpiCell'
import { MetricCard } from '@/components/dashboard/MetricCard'
import { SectionTitle } from '@/components/dashboard/SectionTitle'
import { SessionWatchRail } from '@/components/dashboard/SessionWatchRail'
import { useDashboardRuns } from '@/hooks/useDashboardRuns'
import { avgDuration, medianDuration, stateDistribution } from '@/lib/domain'

export function ControlCenter() {
	const d = useDashboardRuns()
	return (
		<>
			<SessionWatchRail refTime={d.refTime} mode="overview" />
			<FocusedRunPanel refTime={d.refTime} />

			<div className="mx-auto flex max-w-360 flex-col gap-16 px-6 py-12">
				{d.error ? (
					<div className="panel glow-red font-data p-3 text-[12px] text-oxide">{d.error}</div>
				) : null}

				{/* ── Executive Summary + KPI ── */}
				<div className="flex flex-col gap-6">
					<div className="fade-up grid grid-cols-2 gap-4 md:grid-cols-4">
						<MetricCard
							label="Completed"
							value={d.completed.length}
							sub={d.terminal.length > 0 ? `/ ${d.terminal.length} total` : ''}
							color="mineral"
						/>
						<MetricCard
							label="Active"
							value={d.active.length}
							sub={d.inProgress.length > 0 ? `${d.inProgress.length} in progress` : 'idle'}
							color="cyan"
						/>
						<MetricCard
							label="Attention"
							value={d.needsAttention.length}
							sub={
								d.needsAttention.length === 0
									? 'all clear'
									: `${d.waitingHuman.length} blocked · ${d.failed.length} failed`
							}
							color={d.needsAttention.length > 0 ? 'oxide' : 'dim'}
							glow={d.needsAttention.length > 0}
						/>
						<MetricCard
							label="Success Rate"
							value={d.successRate !== null ? `${d.successRate}%` : '--'}
							sub={d.terminal.length > 0 ? `${d.terminal.length} terminal runs` : 'no data'}
							color={
								d.successRate !== null && d.successRate >= 80
									? 'mineral'
									: d.successRate !== null && d.successRate < 50
										? 'oxide'
										: 'silver'
							}
						/>
					</div>

					<div className="fade-up grid grid-cols-3 gap-3 delay-1 md:grid-cols-6">
						<KpiCell label="Median" value={medianDuration(d.runs)} />
						<KpiCell label="Oldest Active" value={d.oldestActive} />
						<KpiCell
							label="Waiting"
							value={d.waitingHuman.length}
							alert={d.waitingHuman.length > 0}
						/>
						<KpiCell label="Failed" value={d.failed.length} alert={d.failed.length > 0} />
						<KpiCell label="Reviewing" value={d.reviewing.length} />
						<KpiCell label="Opening PR" value={d.openingPr.length} />
					</div>
				</div>

				{/* ── Attention Zone ── */}
				{d.needsAttention.length > 0 || d.aging.length > 0 ? (
					<section className="fade-up delay-2">
						<SectionTitle
							title="ATTENTION"
							accent="oxide"
							count={d.needsAttention.length + d.aging.length}
						/>
						<div className="panel glow-red overflow-hidden">
							{d.needsAttention.map((run, i) => (
								<AlertRow
									key={run.id}
									run={run}
									refTime={d.refTime}
									reason={
										run.state === 'waiting_human'
											? 'Blocked — waiting human'
											: 'Run failed'
									}
									isLast={i === d.needsAttention.length - 1 && d.aging.length === 0}
								/>
							))}
							{d.aging.map((run, i) => (
								<AlertRow
									key={run.id}
									run={run}
									refTime={d.refTime}
									reason={`Aging — ${d.oldestActive} elapsed`}
									isLast={i === d.aging.length - 1}
								/>
							))}
						</div>
					</section>
				) : null}

				{/* ── Active Runs Board ── */}
				{d.active.length > 0 ? (
					<section className="fade-up delay-3">
						<SectionTitle title="ACTIVE RUNS" count={d.active.length} />
						<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
							<BoardCol
								title="In Progress"
								count={d.inProgress.length}
								runs={d.inProgress}
								refTime={d.refTime}
								accent="cyan"
							/>
							<BoardCol
								title="Needs Human"
								count={d.waitingHuman.length}
								runs={d.waitingHuman}
								refTime={d.refTime}
								accent="gold"
							/>
							<BoardCol
								title="Queued"
								count={d.queued.length}
								runs={d.queued}
								refTime={d.refTime}
								accent="dim"
							/>
						</div>
					</section>
				) : null}

				<CompletedTable completed={d.completed} />

				{/* ── Reliability ── */}
				<section className="fade-up">
					<SectionTitle title="RELIABILITY" />
					<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
						<DistPanel title="By State" items={stateDistribution(d.runs)} total={d.runs.length} />
						<DistPanel
							title="Terminal Outcomes"
							items={[
								{ label: 'Completed', count: d.completed.length, color: 'bg-mineral' },
								{ label: 'Failed', count: d.failed.length, color: 'bg-oxide' },
								{ label: 'Cancelled', count: d.cancelled.length, color: 'bg-dim' }
							]}
							total={d.terminal.length}
						/>
						<div className="panel p-4">
							<h4 className="font-data mb-4 text-[10px] tracking-wider text-dim uppercase">
								Avg Duration
							</h4>
							<div className="space-y-3">
								<DurationRow
									label="Completed"
									value={avgDuration(d.completed)}
									color="text-mineral"
								/>
								<DurationRow
									label="Failed"
									value={avgDuration(d.failed)}
									color="text-oxide"
								/>
								<DurationRow
									label="Median (all)"
									value={medianDuration(d.runs)}
									color="text-silver"
								/>
							</div>
						</div>
					</div>
				</section>

				<div className="h-10" />
			</div>
		</>
	)
}
