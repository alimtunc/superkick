import { Icon } from '@/components/primitives'
interface DoneFooterProps {
	count: number
	revealed: boolean
	onToggle: () => void
}

export function DoneFooter({ count, revealed, onToggle }: DoneFooterProps) {
	if (!revealed && count === 0) return null
	return (
		<div className="flex h-9 items-center gap-2 border-t border-border bg-surface pr-6 pl-5 text-[12px] text-fg-dim">
			<Icon name="check" size={12} className="shrink-0" />
			<span>
				{revealed ? `Showing ${count} done this week` : `${count} done this week · hidden by default`}
			</span>
			<button
				type="button"
				onClick={onToggle}
				className="rounded text-[12px] font-medium text-fg-muted transition-colors hover:text-fg focus-visible:ring-1 focus-visible:ring-accent-soft focus-visible:outline-none"
			>
				{revealed ? 'Hide' : 'Show'}
			</button>
		</div>
	)
}
