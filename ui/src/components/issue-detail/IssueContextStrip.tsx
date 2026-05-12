import type { ReactNode } from 'react'

import { AuthorAvatar } from '@/components/issue-detail/AuthorAvatar'
import { RunStateBadge } from '@/components/RunStateBadge'
import { fmtRelativeTime, pickLatestRun } from '@/lib/domain'
import type { IssueDetailResponse } from '@/types'

interface ContextCellProps {
	label: string
	children: ReactNode
}

function ContextCell({ label, children }: ContextCellProps) {
	return (
		<div className="min-w-0">
			<div className="font-data text-[10px] tracking-[0.08em] text-fg-dim uppercase">{label}</div>
			<div className="mt-1 truncate text-[13px] text-fg">{children}</div>
		</div>
	)
}

export function IssueContextStrip({ issue }: { issue: IssueDetailResponse }) {
	const latestRun = pickLatestRun(issue.linked_runs)
	const projectLabel = issue.project?.name ?? '—'

	return (
		<div className="grid gap-5 border-b border-border bg-surface px-6 py-3.5 sm:grid-cols-2 lg:grid-cols-4">
			<ContextCell label="Project">
				<span className="text-fg">{projectLabel}</span>
			</ContextCell>
			<ContextCell label="Assignee">
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
			</ContextCell>
			<ContextCell label="Linked runs">
				<span className="font-data text-fg">{issue.linked_runs.length}</span>
				{issue.linked_runs.length > 0 ? <span className="ml-1.5 text-fg-dim">total</span> : null}
			</ContextCell>
			<ContextCell label="Last run">
				{latestRun ? (
					<span className="inline-flex items-center gap-2">
						<RunStateBadge state={latestRun.state} />
						<span className="font-data text-[11.5px] text-fg-dim">
							{fmtRelativeTime(latestRun.started_at)}
						</span>
					</span>
				) : (
					<span className="text-fg-dim">No runs yet</span>
				)}
			</ContextCell>
		</div>
	)
}
