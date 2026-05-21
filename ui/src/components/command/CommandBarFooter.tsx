import { Kbd } from '@/ui/Kbd'

interface CommandBarFooterProps {
	resultCount: number
}

export function CommandBarFooter({ resultCount }: CommandBarFooterProps) {
	return (
		<div className="flex items-center gap-3 border-t border-border px-4 py-2 text-[11px] text-fg-dim">
			<span className="flex items-center gap-1">
				<Kbd>↑</Kbd>
				<Kbd>↓</Kbd>
				<span>navigate</span>
			</span>
			<span className="flex items-center gap-1">
				<Kbd>↵</Kbd>
				<span>open</span>
			</span>
			<span className="flex items-center gap-1">
				<Kbd>⌘</Kbd>
				<Kbd>↵</Kbd>
				<span>launch task</span>
			</span>
			<span className="flex items-center gap-1">
				<Kbd>tab</Kbd>
				<span>scope</span>
			</span>
			<span className="ml-auto font-mono">{resultCount} results</span>
		</div>
	)
}
