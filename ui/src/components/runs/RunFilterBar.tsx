import type { RunFilter } from '@/types'

const FILTERS: { key: RunFilter; label: string }[] = [
	{ key: 'all', label: 'ALL' },
	{ key: 'active', label: 'ACTIVE' },
	{ key: 'completed', label: 'COMPLETED' },
	{ key: 'failed', label: 'FAILED' },
	{ key: 'cancelled', label: 'CANCELLED' }
]

export function RunFilterBar({
	filter,
	onFilter,
	counts
}: {
	filter: RunFilter
	onFilter: (f: RunFilter) => void
	counts: Record<RunFilter, number>
}) {
	return (
		<div className="flex gap-1 border-b border-edge pb-4">
			{FILTERS.map((f) => (
				<button
					key={f.key}
					type="button"
					onClick={() => onFilter(f.key)}
					className={[
						'font-data inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[10px] font-medium tracking-wide transition-colors',
						filter === f.key
							? 'bg-slate-deep text-fog'
							: 'text-dim hover:bg-slate-deep/50 hover:text-silver'
					].join(' ')}
				>
					{f.label}
					<span className="text-dim">{counts[f.key]}</span>
				</button>
			))}
		</div>
	)
}
