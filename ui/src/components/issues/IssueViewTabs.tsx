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
		<div className="view-tabs">
			{TAB_ORDER.map((value) => {
				const active = value === tab
				return (
					<button
						key={value}
						type="button"
						onClick={() => onChange(value)}
						aria-pressed={active}
						className={cn('view-tab', active ? 'view-tab--active' : null)}
					>
						<span>{TAB_LABELS[value]}</span>
						<span className="view-tab__count">{counts[value]}</span>
					</button>
				)
			})}
			<button
				type="button"
				disabled
				title="Saved views — coming soon"
				className="view-tab cursor-default text-fg-dim"
			>
				<Icon name="plus" size={12} className="ic" />
				<span>New view</span>
			</button>
		</div>
	)
}
