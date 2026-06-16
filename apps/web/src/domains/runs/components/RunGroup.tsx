import { EmptyState } from '@/components/primitives'
import { RunCard } from '@/domains/runs/components/RunCard'
import type { QueueRunSummary } from '@/types'

type RunGroupTone = 'oxide' | 'cyan' | 'violet' | 'mineral'

const toneToText: Record<RunGroupTone, string> = {
	oxide: 'text-danger',
	cyan: 'text-info',
	violet: 'text-accent',
	mineral: 'text-success'
}

const toneToBorder: Record<RunGroupTone, string> = {
	oxide: 'border-t-danger',
	cyan: 'border-t-info',
	violet: 'border-t-accent',
	mineral: 'border-t-success'
}

interface RunGroupProps {
	id: string
	tone: RunGroupTone
	label: string
	description: string
	runs: QueueRunSummary[]
	refTime: number
	cardVariant: 'default' | 'respond'
	emptyLabel: string
}

// Kanban column with independent scroll so columns don't reflow together.
export function RunGroup({
	id,
	tone,
	label,
	description,
	runs,
	refTime,
	cardVariant,
	emptyLabel
}: RunGroupProps) {
	return (
		<section
			id={id}
			className={`flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-t-2 border-border bg-surface ${toneToBorder[tone]}`}
		>
			<header className="flex items-start justify-between gap-2 border-b border-border px-3 py-2">
				<div className="min-w-0">
					<p className={`font-data text-[10px] tracking-widest uppercase ${toneToText[tone]}`}>
						{label}
					</p>
					<p className="font-data mt-0.5 truncate text-[10px] text-fg-dim">{description}</p>
				</div>
				<span className="font-data shrink-0 text-[11px] text-fg-dim">{runs.length}</span>
			</header>
			<div className="flex-1 overflow-y-auto p-2">
				{runs.length === 0 ? (
					<EmptyState density="compact" title={emptyLabel} />
				) : (
					<div className="flex flex-col gap-2">
						{runs.map((run) => (
							<RunCard key={run.id} run={run} refTime={refTime} variant={cardVariant} />
						))}
					</div>
				)}
			</div>
		</section>
	)
}
