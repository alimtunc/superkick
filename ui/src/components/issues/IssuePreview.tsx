import { LabelChip } from '@/components/issue-detail/LabelChip'
import { StatusChip } from '@/components/issue-detail/StatusChip'
import { Pill } from '@/components/ui/pill'
import { priorityColor } from '@/lib/domain/priorityMeta'
import type { LinearIssueListItem } from '@/types'

export function IssuePreview({ issue }: { issue: LinearIssueListItem }) {
	const pColor = priorityColor(issue.priority.value)

	return (
		<div className="flex w-80 flex-col gap-2 rounded-md border border-edge bg-panel p-3 shadow-xl">
			<div className="flex items-center gap-2">
				<span className="font-data text-[11px] font-medium text-fog">{issue.identifier}</span>
				<StatusChip status={issue.status} />
				<Pill
					size="xs"
					style={{
						color: pColor,
						borderColor: `color-mix(in oklch, ${pColor} 30%, transparent)`,
						backgroundColor: `color-mix(in oklch, ${pColor} 10%, transparent)`
					}}
				>
					{issue.priority.label}
				</Pill>
			</div>

			<p className="text-sm leading-snug font-medium text-fog">{issue.title}</p>

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

			{issue.labels.length > 0 ? (
				<div className="flex flex-wrap gap-1">
					{issue.labels.map((label) => (
						<LabelChip key={label.name} label={label} />
					))}
				</div>
			) : null}

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
