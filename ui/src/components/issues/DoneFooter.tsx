interface DoneFooterProps {
	count: number
	revealed: boolean
	onToggle: () => void
}

export function DoneFooter({ count, revealed, onToggle }: DoneFooterProps) {
	if (!revealed && count === 0) return null
	return (
		<div className="flex h-9 items-center border-t border-border bg-surface px-6">
			<button
				type="button"
				onClick={onToggle}
				className="text-[11px] font-medium text-fg-dim transition-colors hover:text-fg focus-visible:ring-1 focus-visible:ring-accent-soft focus-visible:outline-none"
			>
				{revealed ? 'Hide done' : `Show ${count} done this week`}
			</button>
		</div>
	)
}
