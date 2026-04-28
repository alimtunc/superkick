import { useMemo } from 'react'

import { SectionTitle } from '@/components/dashboard/SectionTitle'
import { IssueGroupCard } from '@/components/issues/IssueGroupCard'
import { V1IssueRow } from '@/components/issues/V1IssueRow'
import { useNow } from '@/hooks/useNow'
import type { V1IssueWithState } from '@/hooks/useV1Issues'
import { v1IssueStateAccent } from '@/lib/domain'
import type {
	GroupedIssues,
	LaunchQueueItem,
	LinearIssueListItem,
	V1IssueState,
	V1StateFilter
} from '@/types'

interface V1IssueListViewProps {
	allIssues: readonly V1IssueWithState[]
	queueItems: readonly LaunchQueueItem[]
	filteredIssues: readonly LinearIssueListItem[]
	grouped: GroupedIssues
	activeV1State: V1StateFilter
}

export function V1IssueListView({
	allIssues,
	queueItems,
	filteredIssues,
	grouped,
	activeV1State
}: V1IssueListViewProps) {
	const refTime = useNow()

	const queueItemByIdentifier = useMemo(() => {
		const map = new Map<string, LaunchQueueItem>()
		for (const item of queueItems) {
			if (item.kind === 'issue') map.set(item.issue.identifier, item)
			else if (item.linked_issue) map.set(item.linked_issue.identifier, item)
		}
		return map
	}, [queueItems])

	const stateByIssueId = useMemo(() => {
		const map = new Map<string, V1IssueState>()
		for (const item of allIssues) map.set(item.issue.id, item.state)
		return map
	}, [allIssues])

	const sectionLabel = activeV1State === 'all' ? 'All' : v1IssueStateAccent[activeV1State].label

	function renderRow(issue: LinearIssueListItem, indent: boolean) {
		const state = stateByIssueId.get(issue.id) ?? 'todo'
		return (
			<V1IssueRow
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
				<p className="font-data py-6 text-center text-[11px] text-dim">
					No {sectionLabel.toLowerCase()} issues.
				</p>
			)}
		</section>
	)
}
