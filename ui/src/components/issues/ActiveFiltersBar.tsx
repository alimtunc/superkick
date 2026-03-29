import type { ReactNode } from 'react'

import { PriorityIcon } from '@/components/issues/PriorityIcon'
import { PRIORITY_META } from '@/lib/domain/priorityMeta'

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
			{/* Priority filter pills */}
			{activePriorities.size > 0 ? (
				<FilterPill>
					<span className="font-data text-[11px] text-dim">Priority is</span>
					{[...activePriorities].map((v) => (
						<span
							key={v}
							className="font-data inline-flex cursor-pointer items-center gap-1 rounded-md border border-edge px-1.5 py-0.5 text-[10px] text-silver transition-colors hover:bg-white/5"
							onClick={() => onTogglePriority(v)}
							role="button"
							tabIndex={0}
							onKeyDown={(e) => {
								if (e.key === 'Enter') onTogglePriority(v)
							}}
						>
							<PriorityIcon value={v} />
							{PRIORITY_META[v]?.label ?? `P${v}`}
							<span className="ml-0.5 text-dim">&times;</span>
						</span>
					))}
				</FilterPill>
			) : null}

			{/* Project filter pill */}
			{activeProject !== null ? (
				<RemovablePill onRemove={onClearProject}>
					<span className="font-data text-[11px] text-dim">Project is</span>
					<span className="font-data text-[11px] text-silver">{activeProject}</span>
				</RemovablePill>
			) : null}

			{/* Label filter pills */}
			{activeLabels.size > 0 ? (
				<FilterPill>
					<span className="font-data text-[11px] text-dim">Labels is</span>
					{[...activeLabels].map((name) => {
						const color = labelColors.get(name) ?? '#6b7280'
						return (
							<span
								key={name}
								className="font-data inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition-colors hover:brightness-125"
								style={{ color, borderColor: `${color}40` }}
								onClick={() => onToggleLabel(name)}
								role="button"
								tabIndex={0}
								onKeyDown={(e) => {
									if (e.key === 'Enter') onToggleLabel(name)
								}}
							>
								<span
									className="inline-block h-1.5 w-1.5 rounded-full"
									style={{ backgroundColor: color }}
								/>
								{name}
								<span className="ml-0.5 text-dim">&times;</span>
							</span>
						)
					})}
				</FilterPill>
			) : null}

			<button
				type="button"
				onClick={onClearAll}
				className="font-data cursor-pointer text-[11px] text-dim transition-colors hover:text-silver"
			>
				Clear
			</button>
		</div>
	)
}

function FilterPill({ children }: { children: ReactNode }) {
	return <span className="inline-flex items-center gap-1.5">{children}</span>
}

function RemovablePill({ onRemove, children }: { onRemove: () => void; children: ReactNode }) {
	return (
		<span className="inline-flex items-center gap-1.5 rounded-md border border-edge px-2 py-0.5">
			{children}
			<button
				type="button"
				onClick={onRemove}
				className="cursor-pointer text-[11px] text-dim transition-colors hover:text-silver"
			>
				&times;
			</button>
		</span>
	)
}
