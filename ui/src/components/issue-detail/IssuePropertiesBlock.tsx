import type { ReactNode } from 'react'

import { AuthorAvatar } from '@/components/issue-detail/AuthorAvatar'
import { LabelChip } from '@/components/issue-detail/LabelChip'
import { StatusChip } from '@/components/issue-detail/StatusChip'
import { PRIORITY_META } from '@/lib/domain/priorityMeta'
import { formatShortDate } from '@/lib/format'
import type { IssueDetailResponse } from '@/types'
import { Icon, PriorityIcon, priorityIconKindFromValue } from '@/ui'

interface RowProps {
	label: string
	children: ReactNode
}

function Row({ label, children }: RowProps) {
	return (
		<div className="flex min-h-7 items-start gap-3 py-1.25">
			<span className="w-23 shrink-0 pt-0.5 text-[12px] text-fg-dim">{label}</span>
			<div className="min-w-0 flex-1 text-[12.5px] leading-5 text-fg">{children}</div>
		</div>
	)
}

export function IssuePropertiesBlock({ issue }: { issue: IssueDetailResponse }) {
	const priorityMeta = PRIORITY_META[issue.priority.value]
	const priorityLabel = priorityMeta?.label ?? issue.priority.label
	const cycleLabel = issue.cycle?.name ?? null
	const dueLabel = issue.due_date ? formatShortDate(issue.due_date) : null

	return (
		<section aria-label="Issue properties" className="flex flex-col">
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
			{issue.labels.length > 0 ? (
				<Row label="Labels">
					<div className="flex flex-wrap gap-1">
						{issue.labels.map((label) => (
							<LabelChip key={label.name} label={label} />
						))}
					</div>
				</Row>
			) : null}
			<div className="my-2 border-t border-border" />
			<Row label="Project">
				<span className={issue.project ? 'inline-flex items-center gap-1.5 text-fg' : 'text-fg-dim'}>
					{issue.project ? <Icon name="folder" size={12} className="text-fg-dim" /> : null}
					{issue.project?.name ?? 'No project'}
				</span>
			</Row>
			<Row label="Cycle">
				<span className={cycleLabel ? 'text-fg' : 'text-fg-dim'}>{cycleLabel ?? 'No cycle'}</span>
			</Row>
			<Row label="Estimate">
				<span className="inline-flex items-center gap-1.5">
					<span className="font-data inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-raised px-1 text-[11px] text-fg">
						{issue.estimate ?? '—'}
					</span>
					<span className="text-fg-dim">points</span>
				</span>
			</Row>
			<Row label="Due date">
				<span className={dueLabel ? 'text-fg' : 'text-fg-dim'}>{dueLabel ?? 'No due date'}</span>
			</Row>
			{issue.blocked_by.length > 0 ? (
				<>
					<div className="my-2 border-t border-border" />
					<Row label="Relations">
						<div className="flex flex-col gap-1">
							{issue.blocked_by.map((blocker) => (
								<span key={blocker.id} className="text-fg">
									Blocked by <span className="font-medium">{blocker.identifier}</span>
								</span>
							))}
						</div>
					</Row>
				</>
			) : null}
		</section>
	)
}
