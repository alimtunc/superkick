import { Pill } from '@/components/ui/pill'
import {
	fmtRelativeShort,
	LAUNCH_TASK_STATUS_LABEL,
	LAUNCH_TASK_STATUS_TONE,
	pickLinkedRunId
} from '@/lib/domain'
import { useRunDrawerStore } from '@/stores/runDrawer'
import type { LaunchTaskWithSteps } from '@/types'
import { ArrowRight } from 'lucide-react'

interface PastRunRowProps {
	entry: LaunchTaskWithSteps
}

export function PastRunRow({ entry }: PastRunRowProps) {
	const linkedRunId = pickLinkedRunId(entry.steps)
	const openDrawer = useRunDrawerStore((s) => s.openDrawer)
	const taskStatus = entry.task.status

	return (
		<div className="flex items-center gap-2 py-1.5">
			<Pill tone={LAUNCH_TASK_STATUS_TONE[taskStatus]} size="xs" dot>
				{LAUNCH_TASK_STATUS_LABEL[taskStatus]}
			</Pill>
			<span className="font-data min-w-0 flex-1 truncate text-[11.5px] text-fg-muted">
				{entry.task.summary?.trim() || entry.task.id}
			</span>
			<span className="font-data text-[11px] text-fg-dim">
				{fmtRelativeShort(entry.task.updated_at)}
			</span>
			{linkedRunId ? (
				<button
					type="button"
					onClick={() => openDrawer(linkedRunId, 'activity')}
					aria-label={`Open run drawer for task ${entry.task.id}`}
					className="inline-flex h-6 items-center gap-1 rounded border border-border bg-raised px-1.5 text-[11px] text-fg transition-colors hover:bg-overlay focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
				>
					Open
					<ArrowRight size={10} strokeWidth={1.85} aria-hidden="true" />
				</button>
			) : null}
		</div>
	)
}
