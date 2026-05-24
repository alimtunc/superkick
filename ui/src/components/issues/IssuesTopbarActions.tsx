import { Icon } from '@/ui'
import { Kbd } from '@/ui/Kbd'

interface IssuesTopbarActionsProps {
	onSearch: () => void
}

export function IssuesTopbarActions({ onSearch }: IssuesTopbarActionsProps) {
	return (
		<>
			<button
				type="button"
				onClick={onSearch}
				className="flex h-8 w-[238px] items-center gap-2 rounded-md border border-border bg-raised px-2.5 text-left text-[12.5px] text-fg-dim transition-colors hover:border-border-strong hover:text-fg-muted focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
				aria-label="Search issues"
			>
				<Icon name="search" size={13} className="text-fg-dim" />
				<span className="min-w-0 flex-1 truncate">Search issues...</span>
				<Kbd>⌘K</Kbd>
			</button>
			<button
				type="button"
				className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-raised px-3 text-[12.5px] font-semibold text-fg transition-colors hover:border-border-strong hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
				aria-label="New issue"
			>
				<Icon name="plus" size={13} />
				<span>New issue</span>
			</button>
		</>
	)
}
