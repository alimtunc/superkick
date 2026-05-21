import { cn } from '@/lib/utils'
import type { IssueTabCounts, IssueViewTab } from '@/types'
import { Icon } from '@/ui'

interface IssueViewTabsProps {
	tab: IssueViewTab
	counts: IssueTabCounts
	onChange: (next: IssueViewTab) => void
}

const TAB_LABELS: Record<IssueViewTab, string> = {
	mine: 'My open work',
	'all-open': 'All open',
	shipped: 'Recently shipped'
}

const TAB_ORDER: readonly IssueViewTab[] = ['mine', 'all-open', 'shipped']

export function IssueViewTabs({ tab, counts, onChange }: IssueViewTabsProps) {
	return (
		<div className="flex h-10 items-center gap-1 border-b border-border bg-surface px-6">
			{TAB_ORDER.map((value) => {
				const active = value === tab
				return (
					<button
						key={value}
						type="button"
						onClick={() => onChange(value)}
						aria-pressed={active}
						className={cn(
							'inline-flex h-10 items-center gap-1.5 border-b-2 px-2 text-[12px] transition-colors',
							active
								? 'border-accent text-fg'
								: 'border-transparent text-fg-muted hover:text-fg'
						)}
					>
						{value === 'mine' ? <Icon name="star" size={12} className="text-accent" /> : null}
						<span>{TAB_LABELS[value]}</span>
						<span className="font-data text-[11px] text-fg-dim">{counts[value]}</span>
					</button>
				)
			})}
			<button
				type="button"
				disabled
				title="Saved views — coming soon"
				className="ml-1 inline-flex h-10 items-center gap-1 px-2 text-[12px] text-fg-dim opacity-60"
			>
				<Icon name="plus" size={12} />
				<span>New view</span>
			</button>
		</div>
	)
}
