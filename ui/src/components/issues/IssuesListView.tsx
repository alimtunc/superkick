import { SectionTitle } from '@/components/dashboard/SectionTitle'
import { IssueGroupCard } from '@/components/issues/IssueGroupCard'
import { IssueListRow } from '@/components/issues/IssueListRow'
import { EmptyState } from '@/components/ui/state-empty'
import type { IssueWithState } from '@/hooks/useIssues'
import { useNow } from '@/hooks/useNow'
import { issueStateAccent } from '@/lib/domain'
import type {
	GroupedIssues,
	IssueState,
	IssueStateFilter,
	LaunchQueueItem,
	LinearIssueListItem
} from '@/types'
import { Inbox } from 'lucide-react'

interface IssuesListViewProps {
	allIssues: readonly IssueWithState[]
	queueItems: readonly LaunchQueueItem[]
	filteredIssues: readonly LinearIssueListItem[]
	grouped: GroupedIssues
	activeIssueState: IssueStateFilter
}

export function IssuesListView({
	allIssues,
	queueItems,
	filteredIssues,
	grouped,
	activeIssueState
}: IssuesListViewProps) {
	const refTime = useNow()

	const queueItemByIdentifier = new Map<string, LaunchQueueItem>()
	for (const item of queueItems) {
		if (item.kind === 'issue') queueItemByIdentifier.set(item.issue.identifier, item)
		else if (item.linked_issue) queueItemByIdentifier.set(item.linked_issue.identifier, item)
	}

	const stateByIssueId = new Map<string, IssueState>()
	for (const item of allIssues) stateByIssueId.set(item.issue.id, item.state)

	const sectionLabel = activeIssueState === 'all' ? 'All' : issueStateAccent[activeIssueState].label

	function renderRow(issue: LinearIssueListItem, indent: boolean) {
		const state = stateByIssueId.get(issue.id) ?? 'todo'
		return (
			<IssueListRow
				issue={issue}
				state={state}
				queueItem={queueItemByIdentifier.get(issue.identifier)}
				indent={indent}
				refTime={refTime}
			/>
		)
	}

	return (
		<section>
			<SectionTitle title={sectionLabel} count={filteredIssues.length} />
			{filteredIssues.length > 0 ? (
				<div className="space-y-0.5">
					{grouped.groups.map((group) => (
						<IssueGroupCard key={group.parent.id} group={group} renderRow={renderRow} />
					))}
					{grouped.standalone.map((issue) => (
						<div key={issue.id}>{renderRow(issue, false)}</div>
					))}
				</div>
			) : (
				<EmptyState
					icon={Inbox}
					title={`No ${sectionLabel.toLowerCase()} issues`}
					description="Try a different filter or wait for Linear to sync."
				/>
			)}
		</section>
	)
}
