import { cn } from '@/lib/utils'
import type { InboxTabDescriptor, InboxTabId } from '@/types'

interface InboxTabsProps {
	tabs: ReadonlyArray<InboxTabDescriptor>
	active: InboxTabId
	onChange: (next: InboxTabId) => void
}

export function InboxTabs({ tabs, active, onChange }: InboxTabsProps) {
	return (
		<div
			role="tablist"
			aria-label="Inbox tabs"
			className="flex items-center gap-5 border-b border-border px-6"
		>
			{tabs.map((tab) => {
				const isActive = tab.id === active
				return (
					<button
						key={tab.id}
						type="button"
						role="tab"
						aria-selected={isActive}
						onClick={() => onChange(tab.id)}
						className={cn(
							'-mb-px flex items-center gap-1.5 border-b-2 py-3 text-[13px] transition-colors focus-visible:outline-none',
							isActive
								? 'border-accent font-semibold text-fg'
								: 'border-transparent text-fg-muted hover:text-fg'
						)}
					>
						<span>{tab.label}</span>
						<span
							className={cn(
								'rounded-full bg-raised px-1.5 font-mono text-[11px]',
								isActive ? 'text-fg-muted' : 'text-fg-dim'
							)}
						>
							{tab.count}
						</span>
					</button>
				)
			})}
		</div>
	)
}
