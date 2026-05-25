import { fmtRelativeTime, LAUNCH_TASK_STATUS_LABEL } from '@/lib/domain'
import type { LaunchTask } from '@/types'
import { Dot } from '@/ui/Dot'

interface CompactTaskRunRowProps {
	task: LaunchTask
	linkedRunId: string | null
	onOpenDrawer: (() => void) | undefined
}

export function CompactTaskRunRow({ task, linkedRunId, onOpenDrawer }: CompactTaskRunRowProps) {
	const label = LAUNCH_TASK_STATUS_LABEL[task.status]
	const updatedLabel = fmtRelativeTime(task.updated_at)
	const body = (
		<>
			<Dot tone="success" size={6} />
			<span className="font-data min-w-0 flex-1 truncate text-[11px] text-fg-muted">
				{linkedRunId ?? task.id}
			</span>
			<span className="text-[11px] text-fg-dim">{label}</span>
			<span className="font-data text-[10.5px] text-fg-dim">{updatedLabel}</span>
		</>
	)
	if (onOpenDrawer) {
		return (
			<button
				type="button"
				onClick={onOpenDrawer}
				className="flex w-full items-center gap-2 rounded border border-border bg-canvas px-2 py-1.5 text-left hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
				aria-label={`Open run drawer for task ${task.id}`}
			>
				{body}
			</button>
		)
	}
	return (
		<div className="flex w-full items-center gap-2 rounded border border-border bg-canvas px-2 py-1.5">
			{body}
		</div>
	)
}
