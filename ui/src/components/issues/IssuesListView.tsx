import { useState } from 'react'

import { SectionTitle } from '@/components/dashboard/SectionTitle'
import { IssueListRow } from '@/components/issues/IssueListRow'
import { EmptyState } from '@/components/ui/state-empty'
import { useNow } from '@/hooks/useNow'
import { issueStateAccent } from '@/lib/domain'
import type {
	GroupedIssues,
	IssueGroup,
	IssueState,
	IssueStateFilter,
	IssueWithState,
	LaunchQueueItem,
	LinearIssueListItem
} from '@/types'
import { ChevronDown, ChevronRight, Inbox } from 'lucide-react'

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

	return (
		<section>
			<SectionTitle title={sectionLabel} count={filteredIssues.length} />
			{filteredIssues.length > 0 ? (
				<div className="space-y-0.5">
					{grouped.groups.map((group) => (
						<IssueListGroupCard
							key={group.parent.id}
							group={group}
							stateByIssueId={stateByIssueId}
							queueItemByIdentifier={queueItemByIdentifier}
							refTime={refTime}
						/>
					))}
					{grouped.standalone.map((issue) => (
						<div key={issue.id}>
							<IssueListRowFromState
								issue={issue}
								indent={false}
								stateByIssueId={stateByIssueId}
								queueItemByIdentifier={queueItemByIdentifier}
								refTime={refTime}
							/>
						</div>
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

interface IssueListRowFromStateProps {
	issue: LinearIssueListItem
	indent: boolean
	stateByIssueId: ReadonlyMap<string, IssueState>
	queueItemByIdentifier: ReadonlyMap<string, LaunchQueueItem>
	refTime: number
}

function IssueListRowFromState({
	issue,
	indent,
	stateByIssueId,
	queueItemByIdentifier,
	refTime
}: IssueListRowFromStateProps) {
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

interface IssueListGroupCardProps {
	group: IssueGroup
	stateByIssueId: ReadonlyMap<string, IssueState>
	queueItemByIdentifier: ReadonlyMap<string, LaunchQueueItem>
	refTime: number
}

function IssueListGroupCard({
	group,
	stateByIssueId,
	queueItemByIdentifier,
	refTime
}: IssueListGroupCardProps) {
	const [expanded, setExpanded] = useState(true)
	const childCount = group.children.length

	return (
		<div>
			<div className="flex items-center">
				<button
					type="button"
					onClick={() => setExpanded((value) => !value)}
					className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-ash transition-colors hover:bg-slate-deep/50 hover:text-silver focus-visible:ring-2 focus-visible:ring-mineral/40 focus-visible:outline-none"
					title={expanded ? 'Collapse sub-issues' : `Show ${childCount} sub-issues`}
					aria-expanded={expanded}
					aria-label={expanded ? 'Collapse sub-issues' : `Show ${childCount} sub-issues`}
				>
					{expanded ? (
						<ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" />
					) : (
						<ChevronRight size={14} strokeWidth={1.75} aria-hidden="true" />
					)}
				</button>
				<div className="min-w-0 flex-1">
					<IssueListRowFromState
						issue={group.parent}
						indent={false}
						stateByIssueId={stateByIssueId}
						queueItemByIdentifier={queueItemByIdentifier}
						refTime={refTime}
					/>
				</div>
			</div>

			{expanded ? (
				<div className="ml-7">
					{group.children.map((child) => (
						<div key={child.id}>
							<IssueListRowFromState
								issue={child}
								indent
								stateByIssueId={stateByIssueId}
								queueItemByIdentifier={queueItemByIdentifier}
								refTime={refTime}
							/>
						</div>
					))}
				</div>
			) : (
				<button
					type="button"
					onClick={() => setExpanded(true)}
					className="font-data ml-14 cursor-pointer rounded py-1 text-[10px] text-ash transition-colors hover:text-silver focus-visible:ring-2 focus-visible:ring-mineral/40 focus-visible:outline-none"
				>
					{childCount} sub-issue{childCount > 1 ? 's' : ''} hidden
				</button>
			)}
		</div>
	)
}
