import { DoneFooter } from '@/domains/issues/components/DoneFooter'
import { IssueGroupHeader } from '@/domains/issues/components/IssueGroupHeader'
import { IssueRow } from '@/domains/issues/components/IssueRow'
import { IssuesEmptyState } from '@/domains/issues/components/IssuesEmptyState'
import { useCollapsedBuckets } from '@/hooks/useCollapsedBuckets'
import type { IssueGroup, IssueViewTab, LifecycleBucket } from '@/types'
import { CheckCircle2 } from 'lucide-react'

interface IssuesListViewProps {
	tab: IssueViewTab
	groups: IssueGroup[]
	bucketByIdentifier: Map<string, LifecycleBucket>
	doneCountThisWeek: number
	showDone: boolean
	onToggleDone: () => void
	focusedIdentifier: string | null
	/** Reset URL filters; surfaces as the "Clear filters" empty-state action. */
	onClearFilters?: () => void
	/** Switch the tab from `mine` to `all-open` (with filters cleared). */
	onBrowseAllOpen?: () => void
	now?: Date
}

export function IssuesListView({
	tab,
	groups,
	bucketByIdentifier,
	doneCountThisWeek,
	showDone,
	onToggleDone,
	focusedIdentifier,
	onClearFilters,
	onBrowseAllOpen,
	now
}: IssuesListViewProps) {
	const collapsed = useCollapsedBuckets(tab)
	const isShipped = tab === 'shipped'

	if (groups.length === 0) {
		return (
			<section className="content flex flex-1 flex-col">
				<IssuesEmptyState
					icon={CheckCircle2}
					title={emptyTitle(tab)}
					description={emptyDescription(tab)}
					action={emptyAction(tab, { onClearFilters, onBrowseAllOpen })}
				/>
				{isShipped ? null : (
					<DoneFooter count={doneCountThisWeek} revealed={showDone} onToggle={onToggleDone} />
				)}
			</section>
		)
	}

	return (
		<section className="flex flex-1 flex-col">
			<div className="content flex-1">
				{groups.map((group) => (
					<div key={group.key}>
						<IssueGroupHeader
							label={group.label}
							count={group.issues.length}
							bucket={group.bucket}
							statusKind={group.statusKind}
							pinned={group.pinned}
							collapsed={collapsed.has(group.key)}
							onToggle={() => collapsed.toggle(group.key)}
						/>
						{collapsed.has(group.key)
							? null
							: group.issues.map((wrapper) => {
									const bucket = bucketByIdentifier.get(wrapper.issue.identifier) ?? 'open'
									return (
										<IssueRow
											key={wrapper.issue.id}
											wrapper={wrapper}
											bucket={bucket}
											focused={wrapper.issue.identifier === focusedIdentifier}
											now={now}
										/>
									)
								})}
					</div>
				))}
			</div>
			{isShipped ? null : (
				<DoneFooter count={doneCountThisWeek} revealed={showDone} onToggle={onToggleDone} />
			)}
		</section>
	)
}

function emptyTitle(tab: IssueViewTab): string {
	switch (tab) {
		case 'mine':
			return 'Nothing assigned to you.'
		case 'shipped':
			return 'No recent ships.'
		default:
			return 'No open issues match.'
	}
}

function emptyDescription(tab: IssueViewTab): string {
	switch (tab) {
		case 'mine':
			return "You're clear. Browse All open to grab something, or create an issue."
		case 'shipped':
			return 'Issues completed in the last 7 days will show up here.'
		default:
			return 'Adjust filters or try another tab.'
	}
}

function emptyAction(
	tab: IssueViewTab,
	handlers: { onClearFilters?: () => void; onBrowseAllOpen?: () => void }
): React.ReactNode {
	if (tab === 'mine' && handlers.onBrowseAllOpen) {
		return (
			<button type="button" onClick={handlers.onBrowseAllOpen} className="btn btn--sm">
				Browse all open
			</button>
		)
	}
	if (tab !== 'shipped' && handlers.onClearFilters) {
		return (
			<button type="button" onClick={handlers.onClearFilters} className="btn btn--sm">
				Clear filters
			</button>
		)
	}
	return null
}
