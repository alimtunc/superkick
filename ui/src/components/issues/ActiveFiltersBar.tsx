import { FilterPill } from '@/components/issues/FilterPill'
import { PriorityIcon } from '@/components/issues/PriorityIcon'
import { RemovablePill } from '@/components/issues/RemovablePill'
import { PRIORITY_META } from '@/lib/domain/priorityMeta'
import { DEFAULT_LABEL_COLOR } from '@/lib/issueLabels'
import { X } from 'lucide-react'

export function ActiveFiltersBar({
	activeLabels,
	labelColors,
	onToggleLabel,
	activeProject,
	onClearProject,
	activePriorities,
	onTogglePriority,
	onClearAll
}: {
	activeLabels: Set<string>
	labelColors: Map<string, string>
	onToggleLabel: (label: string) => void
	activeProject: string | null
	onClearProject: () => void
	activePriorities: Set<number>
	onTogglePriority: (v: number) => void
	onClearAll: () => void
}) {
	const hasAny = activeLabels.size > 0 || activeProject !== null || activePriorities.size > 0
	if (!hasAny) return null

	return (
		<div className="flex flex-wrap items-center gap-2">
			{activePriorities.size > 0 ? (
				<FilterPill>
					<span className="font-mono text-[11px] text-fg-dim">Priority is</span>
					{[...activePriorities].map((v) => (
						<button
							key={v}
							type="button"
							className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border bg-raised px-1.5 py-0.5 font-mono text-[10px] text-fg-muted transition-colors hover:bg-overlay focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
							onClick={() => onTogglePriority(v)}
							aria-label={`Remove priority ${PRIORITY_META[v]?.label ?? `P${v}`}`}
						>
							<PriorityIcon value={v} />
							{PRIORITY_META[v]?.label ?? `P${v}`}
							<X size={10} strokeWidth={2} className="ml-0.5 text-fg-dim" aria-hidden="true" />
						</button>
					))}
				</FilterPill>
			) : null}

			{activeProject !== null ? (
				<RemovablePill onRemove={onClearProject}>
					<span className="font-mono text-[11px] text-fg-dim">Project is</span>
					<span className="font-mono text-[11px] text-fg-muted">{activeProject}</span>
				</RemovablePill>
			) : null}

			{activeLabels.size > 0 ? (
				<FilterPill>
					<span className="font-mono text-[11px] text-fg-dim">Labels is</span>
					{[...activeLabels].map((name) => {
						const color = labelColors.get(name) ?? DEFAULT_LABEL_COLOR
						return (
							<button
								key={name}
								type="button"
								className="inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] transition-colors hover:brightness-125 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
								style={{ color, borderColor: `${color}40` }}
								onClick={() => onToggleLabel(name)}
								aria-label={`Remove label ${name}`}
							>
								<span
									className="inline-block size-1.5 rounded-full"
									style={{ backgroundColor: color }}
								/>
								{name}
								<X
									size={10}
									strokeWidth={2}
									className="ml-0.5 text-fg-dim"
									aria-hidden="true"
								/>
							</button>
						)
					})}
				</FilterPill>
			) : null}

			<button
				type="button"
				onClick={onClearAll}
				className="cursor-pointer font-mono text-[11px] text-fg-dim transition-colors hover:text-fg-muted"
			>
				Clear
			</button>
		</div>
	)
}
