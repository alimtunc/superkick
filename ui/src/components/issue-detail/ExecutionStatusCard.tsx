import { useIssueLaunchTasks } from '@/hooks/useIssueLaunchTasks'
import { fmtRelativeTime, isActiveRun, LAUNCH_TASK_STATUS_LABEL, pickLatestRun } from '@/lib/domain'
import { cn } from '@/lib/utils'
import { useRunDrawerStore } from '@/stores/runDrawer'
import type { IssueDetailResponse, LaunchTask, LinkedRunSummary } from '@/types'
import { Dot } from '@/ui/Dot'
import { Link } from '@tanstack/react-router'
import { ArrowRight, ExternalLink, Zap } from 'lucide-react'

interface ExecutionStatusCardProps {
	issue: IssueDetailResponse
}

export function ExecutionStatusCard({ issue }: ExecutionStatusCardProps) {
	const { view, activeTask } = useIssueLaunchTasks(issue.identifier)
	const activeRun = issue.linked_runs.find(isActiveRun)
	const latestRun = pickLatestRun(issue.linked_runs)
	const drawerRun = activeRun ?? latestRun
	const openDrawer = useRunDrawerStore((s) => s.openDrawer)
	const taskCount = view ? 1 : 0

	return (
		<section aria-label="Tasks" className="rounded-md border border-border bg-surface px-3 py-3">
			<header className="mb-2 flex items-center gap-2">
				<Zap size={13} strokeWidth={1.85} className="text-accent" aria-hidden="true" />
				<span className="text-[13px] font-semibold text-fg">Tasks</span>
				<span className="font-data text-[11px] text-fg-dim">{taskCount}</span>
				<span className="font-data ml-auto text-[11px] text-fg-dim">History</span>
			</header>
			{view ? (
				<TaskRunRow
					task={view.task}
					run={drawerRun}
					active={Boolean(activeRun)}
					taskFinished={!activeTask}
					onOpenDrawer={drawerRun ? () => openDrawer(drawerRun.id, 'activity') : undefined}
				/>
			) : (
				<p className="py-2 text-[12.5px] leading-5 text-fg-muted">No task on this issue.</p>
			)}
			<Link
				to="/tasks/new"
				search={{ issue: issue.identifier }}
				className={cn(
					'mt-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-border text-[12.5px] font-medium transition-colors',
					activeRun
						? 'bg-transparent text-fg hover:bg-raised'
						: 'border-transparent bg-accent text-white hover:opacity-90'
				)}
			>
				<Zap size={12} strokeWidth={1.9} aria-hidden="true" />
				{activeRun ? 'Launch another' : 'Launch task'}
			</Link>
		</section>
	)
}

interface TaskRunRowProps {
	task: LaunchTask
	run: LinkedRunSummary | null
	active: boolean
	taskFinished: boolean
	onOpenDrawer: (() => void) | undefined
}

function TaskRunRow({ task, run, active, taskFinished, onOpenDrawer }: TaskRunRowProps) {
	const startedLabel = fmtRelativeTime(run ? run.started_at : task.created_at)
	return (
		<div className="rounded-md border border-border bg-canvas px-2 py-2">
			<div className="flex items-center gap-2">
				<Dot tone={active ? 'info' : 'success'} size={6} pulse={active} />
				<span className="font-data min-w-0 flex-1 truncate text-[11.5px] text-fg">
					{run ? run.id : task.id}
				</span>
				<span className="text-[11px] text-fg-dim">
					{taskFinished ? 'finished' : LAUNCH_TASK_STATUS_LABEL[task.status]}
				</span>
				<span className="font-data text-[10.5px] text-fg-dim">{startedLabel}</span>
				<Link
					to="/tasks/$taskId"
					params={{ taskId: task.id }}
					className="inline-flex text-fg-dim hover:text-fg"
					aria-label="Open task detail"
					title="Open task detail"
				>
					<ExternalLink size={11} strokeWidth={1.85} aria-hidden="true" />
				</Link>
			</div>
			{onOpenDrawer ? (
				<button
					type="button"
					onClick={onOpenDrawer}
					className="mt-2 inline-flex h-6 w-full items-center justify-between rounded border border-border bg-raised px-2 text-[11.5px] text-fg transition-colors hover:bg-overlay focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
					aria-label={active ? 'Open active run drawer' : 'Open latest run drawer'}
				>
					<span>Open run</span>
					<ArrowRight size={11} strokeWidth={1.85} aria-hidden="true" />
				</button>
			) : null}
		</div>
	)
}
