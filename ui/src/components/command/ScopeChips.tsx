import { cn } from '@/lib/utils'
import type { SearchScope } from '@/types'

interface ScopeChipDef {
	id: SearchScope
	label: string
}

const SCOPES: ScopeChipDef[] = [
	{ id: 'all', label: 'All' },
	{ id: 'issues', label: 'Issues' },
	{ id: 'comments', label: 'Comments' },
	{ id: 'files', label: 'Files' },
	{ id: 'runs', label: 'Runs' },
	{ id: 'actions', label: 'Actions' }
]

interface ScopeChipsProps {
	active: SearchScope
	counts: Partial<Record<SearchScope, number>>
	onPick: (scope: SearchScope) => void
}

export function ScopeChips({ active, counts, onPick }: ScopeChipsProps) {
	return (
		<div className="flex items-center gap-1 border-b border-border px-4 py-1.5">
			{SCOPES.map((scope) => {
				const count = counts[scope.id]
				const isActive = scope.id === active
				return (
					<button
						key={scope.id}
						type="button"
						onClick={() => onPick(scope.id)}
						aria-pressed={isActive}
						className={cn(
							'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] transition-colors',
							isActive
								? 'bg-raised font-medium text-fg'
								: 'text-fg-muted hover:bg-raised/40 hover:text-fg'
						)}
					>
						<span>{scope.label}</span>
						{typeof count === 'number' ? (
							<span className="font-mono text-[10.5px] text-fg-dim">{count}</span>
						) : null}
					</button>
				)
			})}
		</div>
	)
}
