import { useState, type ReactNode } from 'react'

import { IssueRow } from '@/components/issues/IssueRow'
import type { IssueGroup, LinearIssueListItem } from '@/types'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface IssueGroupCardProps {
	group: IssueGroup
	renderRow?: (issue: LinearIssueListItem, indent: boolean) => ReactNode
}

/** Defaults to the legacy `IssueRow`. The list view (SUP-92) injects
 *  `IssueListRow` so grouped sub-issues carry the state pill / run chip too. */
export function IssueGroupCard({ group, renderRow }: IssueGroupCardProps) {
	const [expanded, setExpanded] = useState(true)
	const childCount = group.children.length

	const renderIssue =
		renderRow ??
		((issue: LinearIssueListItem, indent: boolean) => <IssueRow issue={issue} indent={indent} />)

	return (
		<div>
			<div className="flex items-center">
				<button
					type="button"
					onClick={() => setExpanded((v) => !v)}
					className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-ash transition-colors hover:bg-slate-deep/50 hover:text-silver focus-visible:ring-2 focus-visible:ring-mineral/40 focus-visible:outline-none"
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
				<div className="min-w-0 flex-1">{renderIssue(group.parent, false)}</div>
			</div>

			{expanded ? (
				<div className="ml-7">
					{group.children.map((child) => (
						<div key={child.id}>{renderIssue(child, true)}</div>
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
