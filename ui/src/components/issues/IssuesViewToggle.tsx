import { Kanban, List } from 'lucide-react'

export type IssuesViewMode = 'list' | 'kanban'

interface IssuesViewToggleProps {
	value: IssuesViewMode
	onChange: (next: IssuesViewMode) => void
}

const OPTIONS: { value: IssuesViewMode; label: string; icon: typeof List }[] = [
	{ value: 'list', label: 'List', icon: List },
	{ value: 'kanban', label: 'Kanban', icon: Kanban }
]

export function IssuesViewToggle({ value, onChange }: IssuesViewToggleProps) {
	return (
		<div
			role="tablist"
			aria-label="Issues view"
			className="inline-flex rounded-md border border-edge bg-slate-deep/40 p-0.5"
		>
			{OPTIONS.map(({ value: v, label, icon: Icon }) => {
				const active = v === value
				return (
					<button
						key={v}
						role="tab"
						type="button"
						aria-selected={active}
						onClick={() => onChange(v)}
						className={`font-data inline-flex h-6 items-center gap-1.5 rounded px-2.5 text-[11px] transition-colors focus-visible:ring-2 focus-visible:ring-mineral/40 focus-visible:outline-none ${
							active ? 'bg-graphite text-fog shadow-sm' : 'text-ash hover:text-silver'
						}`}
					>
						<Icon size={12} strokeWidth={1.75} aria-hidden="true" />
						{label}
					</button>
				)
			})}
		</div>
	)
}
