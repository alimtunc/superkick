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
		<div className="flex h-[38px] items-center gap-0 border-b border-border bg-surface px-4">
			{TAB_ORDER.map((value) => {
				const active = value === tab
				return (
					<button
						key={value}
						type="button"
						onClick={() => onChange(value)}
						aria-pressed={active}
						className={cn(
							'relative inline-flex h-[38px] items-center gap-[7px] px-3 text-[13px] transition-colors',
							active
								? 'font-medium text-fg after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-[2px] after:bg-fg'
								: 'text-fg-muted hover:text-fg'
						)}
					>
						<span>{TAB_LABELS[value]}</span>
						<span className="font-data inline-flex min-w-4 justify-center rounded-[4px] bg-raised px-[5px] text-center text-[11px] leading-4 text-fg-dim">
							{counts[value]}
						</span>
					</button>
				)
			})}
			<button
				type="button"
				disabled
				title="Saved views — coming soon"
				className="ml-1 inline-flex h-[38px] cursor-default items-center gap-1.5 px-3 text-[12.5px] text-fg-dim hover:text-fg"
			>
				<Icon name="plus" size={12} />
				<span>New view</span>
			</button>
		</div>
	)
}
