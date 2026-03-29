import { priorityColor } from '@/lib/domain/priorityMeta'
import type { LinearIssueListItem } from '@/types'

export function IssuePreview({ issue }: { issue: LinearIssueListItem }) {
	const pColor = priorityColor(issue.priority.value)

	return (
		<div className="flex w-80 flex-col gap-2 rounded-lg border border-edge bg-carbon p-3 shadow-xl">
			{/* Header: identifier + status */}
			<div className="flex items-center gap-2">
				<span className="font-data text-[11px] font-medium text-fog">{issue.identifier}</span>
				<span
					className="rounded px-1.5 py-px text-[9px] font-medium"
					style={{
						color: issue.status.color,
						backgroundColor: `${issue.status.color}15`
					}}
				>
					{issue.status.name}
				</span>
				<span
					className="rounded px-1.5 py-px text-[9px] font-medium"
					style={{ color: pColor, backgroundColor: `${pColor}15` }}
				>
					{issue.priority.label}
				</span>
			</div>

			{/* Title */}
			<p className="font-data text-[11px] leading-snug text-silver">{issue.title}</p>

			{/* Context: parent > project */}
			{issue.parent || issue.project ? (
				<div className="flex items-center gap-1 text-[10px]">
					{issue.parent ? (
						<span className="font-data text-fog/60">{issue.parent.identifier}</span>
					) : null}
					{issue.parent && issue.project ? <span className="text-dim/40">&rsaquo;</span> : null}
					{issue.project ? (
						<span className="font-data text-dim/60">{issue.project.name}</span>
					) : null}
				</div>
			) : null}

			{/* Labels */}
			{issue.labels.length > 0 ? (
				<div className="flex flex-wrap gap-1">
					{issue.labels.map((label) => (
						<span
							key={label.name}
							className="rounded px-1.5 py-px text-[9px] font-medium"
							style={{ color: label.color, backgroundColor: `${label.color}15` }}
						>
							{label.name}
						</span>
					))}
				</div>
			) : null}

			{/* Assignee + children count */}
			<div className="flex items-center gap-3 text-[10px] text-dim">
				{issue.assignee ? <span>{issue.assignee.name}</span> : null}
				{issue.children.length > 0 ? (
					<span>
						{issue.children.length} sub-issue{issue.children.length > 1 ? 's' : ''}
					</span>
				) : null}
			</div>
		</div>
	)
}
