import { TaskDot } from '@/components/issues/TaskDot'
import { agentColor, fmtRelativeShort, pickLinkedRunId, pickRepresentativeStep } from '@/lib/domain'
import { cn } from '@/lib/utils'
import { useRunDrawerStore } from '@/stores/runDrawer'
import type { LaunchTaskStatus, LaunchTaskWithSteps, TaskBadgeKind } from '@/types'
import { ArrowRight, Bot } from 'lucide-react'

interface PastRunRowProps {
	entry: LaunchTaskWithSteps
	last?: boolean
}

const STATUS_DOT: Record<LaunchTaskStatus, TaskBadgeKind> = {
	pending: 'running',
	running: 'running',
	needs_human: 'needs',
	completed: 'shipped',
	failed: 'shipped',
	cancelled: 'shipped'
}

export function PastRunRow({ entry, last = false }: PastRunRowProps) {
	const linkedRunId = pickLinkedRunId(entry.steps)
	const openDrawer = useRunDrawerStore((s) => s.openDrawer)
	const agentName = pickRepresentativeStep(entry.steps)?.agent_name ?? null

	return (
		<button
			type="button"
			disabled={!linkedRunId}
			onClick={() => (linkedRunId ? openDrawer(linkedRunId, 'activity') : undefined)}
			aria-label={`Open run drawer for task ${entry.task.id}`}
			className={cn(
				'flex w-full cursor-pointer items-center gap-2 px-1 py-1.75 text-left transition-colors hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none disabled:cursor-default disabled:hover:bg-transparent',
				last ? null : 'border-b border-border'
			)}
		>
			<TaskDot kind={STATUS_DOT[entry.task.status]} size={7} />
			<span className="font-data text-[11.5px] text-fg">{entry.task.id}</span>
			<span
				className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-white"
				style={{ backgroundColor: agentColor(agentName) }}
				aria-hidden="true"
			>
				<Bot size={9} strokeWidth={2} />
			</span>
			<span className="min-w-0 flex-1 truncate text-[12.5px] text-fg-muted">
				{entry.task.summary?.trim() || entry.task.id}
			</span>
			<span className="font-data shrink-0 text-[11px] text-fg-dim">
				{fmtRelativeShort(entry.task.updated_at)}
			</span>
			<ArrowRight size={11} strokeWidth={1.85} className="shrink-0 text-fg-dim" aria-hidden="true" />
		</button>
	)
}
