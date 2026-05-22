import { RunStateBadge } from '@/components/RunStateBadge'
import { Pill } from '@/components/ui/pill'
import { useIssueLaunchTasks } from '@/hooks/useIssueLaunchTasks'
import {
	fmtRelativeTime,
	isActiveRun,
	LAUNCH_STEP_KIND_LABEL,
	LAUNCH_STEP_STATUS_TONE,
	LAUNCH_TASK_STATUS_LABEL,
	LAUNCH_TASK_STATUS_TONE,
	pickLatestRun
} from '@/lib/domain'
import { cn } from '@/lib/utils'
import { useRunDrawerStore } from '@/stores/runDrawer'
import type { IssueDetailResponse, LaunchTask, LaunchTaskStep, LinkedRunSummary } from '@/types'
import { Dot } from '@/ui/Dot'
import { Link } from '@tanstack/react-router'
import { ExternalLink, Eye, Zap } from 'lucide-react'

interface ExecutionStatusCardProps {
	issue: IssueDetailResponse
}

export function ExecutionStatusCard({ issue }: ExecutionStatusCardProps) {
	const { view, activeTask } = useIssueLaunchTasks(issue.identifier)
	const activeRun = issue.linked_runs.find(isActiveRun)
	const latestRun = pickLatestRun(issue.linked_runs)
	const drawerRun = activeRun ?? latestRun
	const openDrawer = useRunDrawerStore((s) => s.openDrawer)

	if (!view) {
		return (
			<section
				aria-label="Execution status"
				className="rounded-md border border-dashed border-edge/80 bg-graphite/20 px-3 py-3"
			>
				<div className="flex items-center gap-2">
					<Zap size={13} strokeWidth={1.85} className="text-fg-dim" aria-hidden="true" />
					<span className="text-[12.5px] text-fg-dim">No run yet</span>
				</div>
				<p className="mt-1.5 text-[11.5px] leading-relaxed text-fg-dim">
					Launch a task from the topbar to start Plan → Implement → Review.
				</p>
			</section>
		)
	}

	return (
		<section
			aria-label="Execution status"
			className="rounded-md border border-edge bg-graphite/40 px-3 py-3"
		>
			<TaskHeader task={view.task} />
			<PhaseChips task={view.task} steps={view.steps} />
			<RunRow
				run={drawerRun}
				hasActive={Boolean(activeRun)}
				onOpenDrawer={drawerRun ? () => openDrawer(drawerRun.id, 'activity') : undefined}
			/>
			{!activeTask ? (
				<p className="mt-2 text-[11.5px] text-fg-dim">
					Task finished. Open the drawer or task detail to inspect the run.
				</p>
			) : null}
		</section>
	)
}

function TaskHeader({ task }: { task: LaunchTask }) {
	const statusLabel = LAUNCH_TASK_STATUS_LABEL[task.status]
	const tone = LAUNCH_TASK_STATUS_TONE[task.status]
	return (
		<div className="mb-2 flex items-center gap-2">
			<span className="font-data text-[10.5px] tracking-[0.06em] text-fg-dim uppercase">Execution</span>
			<Pill tone={tone} size="xs" dot pulse={task.status === 'running'}>
				{statusLabel}
			</Pill>
			<Link
				to="/tasks/$taskId"
				params={{ taskId: task.id }}
				className="ml-auto inline-flex items-center gap-1 rounded-md px-1 text-[11px] text-fg-muted hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
				aria-label="Open task detail"
				title="Open task detail"
			>
				<ExternalLink size={11} strokeWidth={1.85} aria-hidden="true" />
				Task
			</Link>
		</div>
	)
}

interface PhaseChipsProps {
	task: LaunchTask
	steps: readonly LaunchTaskStep[]
}

function PhaseChips({ task, steps }: PhaseChipsProps) {
	if (steps.length === 0) {
		return <div className="font-data mb-2 text-[11.5px] text-fg-dim">Waiting on plan…</div>
	}
	return (
		<div className="mb-2 flex flex-wrap gap-1.5">
			{steps.map((step) => {
				const tone = LAUNCH_STEP_STATUS_TONE[step.status]
				const isCurrent = step.id === task.current_step_id
				const isPending = step.status === 'pending'
				return (
					<div
						key={step.id}
						className={cn(
							'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11.5px]',
							isPending
								? 'border-dashed border-edge bg-transparent text-fg-dim'
								: 'border-edge bg-raised text-fg'
						)}
					>
						<Dot tone={tone} size={6} pulse={isCurrent && step.status === 'running'} />
						<span>{LAUNCH_STEP_KIND_LABEL[step.step_kind]}</span>
					</div>
				)
			})}
		</div>
	)
}

interface RunRowProps {
	run: LinkedRunSummary | null
	hasActive: boolean
	onOpenDrawer: (() => void) | undefined
}

function RunRow({ run, hasActive, onOpenDrawer }: RunRowProps) {
	if (!run) {
		return <div className="font-data text-[11.5px] text-fg-dim">No linked run yet</div>
	}
	const startedLabel = fmtRelativeTime(run.started_at)
	return (
		<div className="flex flex-wrap items-center gap-2">
			<RunStateBadge state={run.state} />
			<span className="font-data text-[11px] text-fg-dim">{startedLabel}</span>
			{onOpenDrawer ? (
				<button
					type="button"
					onClick={onOpenDrawer}
					className="ml-auto inline-flex h-6 items-center gap-1 rounded-md border border-edge bg-raised px-2 text-[11.5px] text-fg transition-colors hover:bg-slate-deep/50 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
					aria-label={hasActive ? 'Open active run drawer' : 'Open latest run drawer'}
				>
					<Eye size={11} strokeWidth={1.85} aria-hidden="true" />
					Open run
				</button>
			) : null}
		</div>
	)
}
