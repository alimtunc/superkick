import type { ReactNode } from 'react'

import { AuthorAvatar } from '@/components/issue-detail/AuthorAvatar'
import { LabelChip } from '@/components/issue-detail/LabelChip'
import { StatusChip } from '@/components/issue-detail/StatusChip'
import { PRIORITY_META } from '@/lib/domain/priorityMeta'
import type { IssueDetailResponse } from '@/types'
import { PriorityIcon, priorityIconKindFromValue } from '@/ui'

interface RowProps {
	label: string
	children: ReactNode
}

function Row({ label, children }: RowProps) {
	return (
		<div className="flex items-start gap-3 py-1.5">
			<span className="font-data w-20 shrink-0 pt-0.5 text-[10.5px] tracking-[0.06em] text-fg-dim uppercase">
				{label}
			</span>
			<div className="min-w-0 flex-1 text-[12.5px] text-fg">{children}</div>
		</div>
	)
}

export function IssuePropertiesBlock({ issue }: { issue: IssueDetailResponse }) {
	const priorityMeta = PRIORITY_META[issue.priority.value]
	const priorityLabel = priorityMeta?.label ?? issue.priority.label

	return (
		<section
			aria-label="Issue properties"
			className="rounded-md border border-edge bg-graphite/40 px-3 py-2"
		>
			<Row label="Status">
				<StatusChip status={issue.status} />
			</Row>
			<Row label="Priority">
				<span className="inline-flex items-center gap-1.5">
					<PriorityIcon kind={priorityIconKindFromValue(issue.priority.value)} size={12} />
					<span>{priorityLabel}</span>
				</span>
			</Row>
			<Row label="Assignee">
				{issue.assignee ? (
					<span className="inline-flex items-center gap-2">
						<AuthorAvatar
							name={issue.assignee.name}
							avatarUrl={issue.assignee.avatar_url ?? null}
						/>
						<span className="truncate">{issue.assignee.name}</span>
					</span>
				) : (
					<span className="text-fg-dim">Unassigned</span>
				)}
			</Row>
			<Row label="Project">
				<span className={issue.project ? 'text-fg' : 'text-fg-dim'}>
					{issue.project?.name ?? '—'}
				</span>
			</Row>
			{issue.labels.length > 0 ? (
				<Row label="Labels">
					<div className="flex flex-wrap gap-1">
						{issue.labels.map((label) => (
							<LabelChip key={label.name} label={label} />
						))}
					</div>
				</Row>
			) : null}
		</section>
	)
}
