import { useState } from 'react'

import { IssueListRow } from '@/components/issues/IssueListRow'
import { IssuesListColumnHeader } from '@/components/issues/IssuesListColumnHeader'
import { EmptyState } from '@/components/ui/state-empty'
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
	const queueItemByIdentifier = new Map<string, LaunchQueueItem>()
	for (const item of queueItems) {
		if (item.kind === 'issue') queueItemByIdentifier.set(item.issue.identifier, item)
		else if (item.linked_issue) queueItemByIdentifier.set(item.linked_issue.identifier, item)
	}

	const stateByIssueId = new Map<string, IssueState>()
	for (const item of allIssues) stateByIssueId.set(item.issue.id, item.state)

	const filterLabel = activeIssueState === 'all' ? 'all' : activeIssueState.replace('_', ' ')

	return (
		<section className="flex flex-1 flex-col">
			<IssuesListColumnHeader />
			{filteredIssues.length > 0 ? (
				<div>
					{grouped.groups.map((group) => (
						<IssueListGroup
							key={group.parent.id}
							group={group}
							stateByIssueId={stateByIssueId}
							queueItemByIdentifier={queueItemByIdentifier}
						/>
					))}
					{grouped.standalone.map((issue) => (
						<IndentedRow
							key={issue.id}
							issue={issue}
							indent="standalone"
							stateByIssueId={stateByIssueId}
							queueItemByIdentifier={queueItemByIdentifier}
						/>
					))}
				</div>
			) : (
				<div className="px-6 py-12">
					<EmptyState
						icon={Inbox}
						title={`No ${filterLabel} issues`}
						description="Try a different filter or wait for Linear to sync."
					/>
				</div>
			)}
		</section>
	)
}

type RowIndent = 'standalone' | 'child'

const INDENT_CLASS: Record<RowIndent, string> = {
	standalone: 'w-6 shrink-0',
	child: 'w-12 shrink-0'
}

interface IndentedRowProps {
	issue: LinearIssueListItem
	indent: RowIndent
	stateByIssueId: ReadonlyMap<string, IssueState>
	queueItemByIdentifier: ReadonlyMap<string, LaunchQueueItem>
}

function IndentedRow({ issue, indent, stateByIssueId, queueItemByIdentifier }: IndentedRowProps) {
	const state = stateByIssueId.get(issue.id) ?? 'open'
	return (
		<div className="flex items-stretch border-b border-border">
			<span className={INDENT_CLASS[indent]} aria-hidden="true" />
			<IssueListRow
				issue={issue}
				state={state}
				queueItem={queueItemByIdentifier.get(issue.identifier)}
			/>
		</div>
	)
}

interface IssueListGroupProps {
	group: IssueGroup
	stateByIssueId: ReadonlyMap<string, IssueState>
	queueItemByIdentifier: ReadonlyMap<string, LaunchQueueItem>
}

function IssueListGroup({ group, stateByIssueId, queueItemByIdentifier }: IssueListGroupProps) {
	const [expanded, setExpanded] = useState(true)
	const childCount = group.children.length
	const parentState = stateByIssueId.get(group.parent.id) ?? 'open'

	return (
		<div>
			<div className="flex items-stretch border-b border-border">
				<button
					type="button"
					onClick={() => setExpanded((value) => !value)}
					className="flex w-6 shrink-0 cursor-pointer items-center justify-center text-fg-dim transition-colors hover:bg-raised hover:text-fg focus-visible:bg-raised focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
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
				<IssueListRow
					issue={group.parent}
					state={parentState}
					queueItem={queueItemByIdentifier.get(group.parent.identifier)}
				/>
			</div>

			{expanded ? (
				<div className="relative">
					<span
						aria-hidden="true"
						className="pointer-events-none absolute top-0 bottom-0 left-3 w-px bg-border-strong"
					/>
					{group.children.map((child) => (
						<IndentedRow
							key={child.id}
							issue={child}
							indent="child"
							stateByIssueId={stateByIssueId}
							queueItemByIdentifier={queueItemByIdentifier}
						/>
					))}
				</div>
			) : (
				<button
					type="button"
					onClick={() => setExpanded(true)}
					className="cursor-pointer border-b border-border py-1.5 pl-12 text-left font-mono text-[11px] text-fg-dim transition-colors hover:text-fg focus-visible:bg-raised focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
				>
					{childCount} sub-issue{childCount > 1 ? 's' : ''} hidden
				</button>
			)}
		</div>
	)
}
