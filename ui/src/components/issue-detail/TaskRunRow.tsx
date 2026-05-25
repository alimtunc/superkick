import { fmtRelativeTime, LAUNCH_TASK_STATUS_LABEL } from '@/lib/domain'
import type { LaunchTask, LinkedRunSummary } from '@/types'
import { Dot } from '@/ui/Dot'
import { Link } from '@tanstack/react-router'
import { ArrowRight, ExternalLink } from 'lucide-react'

interface TaskRunRowProps {
	task: LaunchTask
	run: LinkedRunSummary | null
	active: boolean
	taskFinished: boolean
	onOpenDrawer: (() => void) | undefined
}

export function TaskRunRow({ task, run, active, taskFinished, onOpenDrawer }: TaskRunRowProps) {
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
