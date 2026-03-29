import { useState } from 'react'

import { IssueRow } from '@/components/issues/IssueRow'
import type { IssueGroup } from '@/lib/domain/groupIssues'
import { ChevronDown, ChevronRight } from 'lucide-react'

export function IssueGroupCard({ group }: { group: IssueGroup }) {
	const [expanded, setExpanded] = useState(true)
	const childCount = group.children.length

	return (
		<div>
			<div className="flex items-center">
				<button
					type="button"
					onClick={() => setExpanded((v) => !v)}
					className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded text-dim transition-colors hover:bg-white/5 hover:text-silver"
					title={expanded ? 'Collapse sub-issues' : `Show ${childCount} sub-issues`}
				>
					{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
				</button>
				<div className="min-w-0 flex-1">
					<IssueRow issue={group.parent} />
				</div>
			</div>

			{expanded ? (
				<div className="ml-7">
					{group.children.map((child) => (
						<IssueRow key={child.id} issue={child} indent />
					))}
				</div>
			) : (
				<button
					type="button"
					onClick={() => setExpanded(true)}
					className="font-data ml-14 cursor-pointer py-1 text-[10px] text-dim transition-colors hover:text-silver"
				>
					{childCount} sub-issue{childCount > 1 ? 's' : ''} hidden
				</button>
			)}
		</div>
	)
}
