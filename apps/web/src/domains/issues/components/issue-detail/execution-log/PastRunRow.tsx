import { launchTaskChip } from '@/domains/runs/components/run-shared/launchTaskChip'
import { RunChip } from '@/domains/runs/components/run-shared/RunChip'
import {
	agentColor,
	fmtRelativeShort,
	pickLatestRun,
	pickLinkedRunId,
	pickRepresentativeStep
} from '@/lib/domain'
import { cn } from '@/lib/utils'
import { useRunDrawerStore } from '@/stores/runDrawer'
import type { LaunchTaskWithSteps, LinkedRunSummary } from '@/types'
import { ArrowRight, Bot } from 'lucide-react'

interface PastRunRowProps {
	entry: LaunchTaskWithSteps
	linkedRuns: readonly LinkedRunSummary[]
	last?: boolean
}

export function PastRunRow({ entry, linkedRuns, last = false }: PastRunRowProps) {
	const openDrawer = useRunDrawerStore((s) => s.openDrawer)
	const runId = pickLinkedRunId(entry.steps) ?? pickLatestRun(linkedRuns)?.id ?? null
	const agentName = pickRepresentativeStep(entry.steps)?.agent_name ?? null
	const chip = launchTaskChip(entry.task.status)

	const body = (
		<>
			<RunChip variant={chip.variant} label={chip.label} glyph="icon" />
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
		</>
	)

	const rowClass = cn(
		'flex w-full items-center gap-2 px-1 py-1.75 text-left',
		last ? null : 'border-b border-border'
	)

	if (!runId) {
		return <div className={rowClass}>{body}</div>
	}

	return (
		<button
			type="button"
			onClick={() => openDrawer(runId, 'activity')}
			aria-label={`Open run drawer for task ${entry.task.id}`}
			className={cn(
				rowClass,
				'cursor-pointer transition-colors hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none'
			)}
		>
			{body}
			<ArrowRight size={11} strokeWidth={1.85} className="shrink-0 text-fg-dim" aria-hidden="true" />
		</button>
	)
}
