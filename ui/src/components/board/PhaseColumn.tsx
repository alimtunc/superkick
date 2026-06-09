import { RunCard } from '@/components/runs/RunCard'
import { EmptyState } from '@/components/ui/state-empty'
import { PHASE_BORDER_CLASS, PHASE_DESCRIPTION, PHASE_TEXT_CLASS } from '@/lib/domain'
import type { PhaseColumn as PhaseColumnData } from '@/types'

interface PhaseColumnProps {
	column: PhaseColumnData
	refTime: number
}

// Kanban column with independent scroll so columns don't reflow together.
export function PhaseColumn({ column, refTime }: PhaseColumnProps) {
	return (
		<section
			className={`flex h-full min-h-0 w-70 shrink-0 flex-col overflow-hidden rounded-md border border-t-2 border-border bg-surface ${PHASE_BORDER_CLASS[column.phase]}`}
		>
			<header className="flex items-start justify-between gap-2 border-b border-border px-3 py-2">
				<div className="min-w-0">
					<p
						className={`font-data text-[10px] tracking-widest uppercase ${PHASE_TEXT_CLASS[column.phase]}`}
					>
						{column.label}
					</p>
					<p className="font-data mt-0.5 truncate text-[10px] text-fg-dim">
						{PHASE_DESCRIPTION[column.phase]}
					</p>
				</div>
				<span className="font-data shrink-0 text-[11px] text-fg-dim">{column.cards.length}</span>
			</header>
			<div className="flex-1 overflow-y-auto p-2">
				{column.cards.length === 0 ? (
					<EmptyState density="compact" title="Nothing here." />
				) : (
					<div className="flex flex-col gap-2">
						{column.cards.map((card) => (
							<RunCard
								key={card.run.id}
								run={card.run}
								refTime={refTime}
								variant={card.needsYou ? 'respond' : 'default'}
							/>
						))}
					</div>
				)}
			</div>
		</section>
	)
}
