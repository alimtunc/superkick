import { Btn, Icon } from '@/components/primitives'
import { cn } from '@/lib/utils'
import type { IssueViewLayout } from '@/types'

interface IssuesTopbarActionsProps {
	onSearch: () => void
	onNew: () => void
	layout: IssueViewLayout
	onLayoutChange: (next: IssueViewLayout) => void
}

export function IssuesTopbarActions({ onSearch, onNew, layout, onLayoutChange }: IssuesTopbarActionsProps) {
	return (
		<>
			<div className="seg" role="group" aria-label="Issue view layout">
				<button
					type="button"
					className={cn(layout === 'list' ? 'on' : null)}
					aria-pressed={layout === 'list'}
					aria-label="List view"
					onClick={() => onLayoutChange('list')}
				>
					<Icon name="layers" size={14} className="ic" />
					List
				</button>
				<button
					type="button"
					className={cn(layout === 'board' ? 'on' : null)}
					aria-pressed={layout === 'board'}
					aria-label="Board view"
					onClick={() => onLayoutChange('board')}
				>
					<Icon name="folder" size={14} className="ic" />
					Board
				</button>
			</div>
			<Btn kind="ghost" icon="search" onClick={onSearch} title="Search" aria-label="Search issues" />
			<Btn kind="primary" size="sm" icon="plus" onClick={onNew}>
				New issue
			</Btn>
		</>
	)
}
