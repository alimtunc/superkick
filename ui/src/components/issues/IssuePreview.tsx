import { useEffect } from 'react'

import { LabelChip } from '@/components/issue-detail/LabelChip'
import { AssigneeAvatar } from '@/components/issues/AssigneeAvatar'
import { ProjectTag } from '@/components/issues/ProjectTag'
import { agentColor } from '@/lib/domain/agentColor'
import { runStateLabel } from '@/lib/domain/displayLabels'
import { fmtRelativeShort, fmtRelativeTime } from '@/lib/domain/formatters'
import { subIssueCount } from '@/lib/issues/subIssues'
import { stripMarkdown } from '@/lib/markdown'
import { issueDetailQuery } from '@/lib/queries'
import { cn } from '@/lib/utils'
import type { IssueWithState, LifecycleBucket } from '@/types'
import {
	Dot,
	EstimateChip,
	Icon,
	PriorityIcon,
	priorityIconKindFromValue,
	StatusIcon,
	statusIconKindFor,
	SubCountChip
} from '@/ui'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

interface IssuePreviewProps {
	wrapper: IssueWithState
	bucket: LifecycleBucket
}

const BODY_CLAMP = 'line-clamp-3'
const COMMENT_CLAMP = 'line-clamp-2'

export function IssuePreview({ wrapper, bucket }: IssuePreviewProps) {
	void bucket
	const issue = wrapper.issue
	const navigate = useNavigate()
	const { data: detail } = useQuery(issueDetailQuery(issue.id))

	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			if (event.key === 'Escape') {
				event.stopPropagation()
			}
		}
		document.addEventListener('keydown', onKey)
		return () => document.removeEventListener('keydown', onKey)
	}, [])

	const lastComment = pickLastComment(detail?.comments)
	const linkedRun = wrapper.linkedRun
	const assignee = issue.assignee
	const subCount = subIssueCount(issue.children)
	const estimate = detail?.estimate ?? null
	const hasMetaRow = assignee !== null || subCount.total > 0 || estimate !== null
	const hasLabelsRow = issue.labels.length > 0 || issue.project !== null
	const description = detail?.description ? stripMarkdown(detail.description) : ''

	function onOpen(event: React.MouseEvent) {
		event.preventDefault()
		event.stopPropagation()
		navigate({ to: '/issues/$issueId', params: { issueId: issue.identifier } })
	}

	return (
		<div className="z-popover w-[480px] overflow-hidden rounded-[10px] border border-border bg-overlay shadow-[0_24px_56px_rgba(0,0,0,0.55)]">
			<div className="flex items-center justify-between gap-2 px-[14px] pt-[12px] pb-[6px]">
				<div className="flex items-center gap-2">
					<PriorityIcon kind={priorityIconKindFromValue(issue.priority.value)} size={13} />
					<StatusIcon kind={statusIconKindFor(issue.status)} size={13} />
					<span className="font-data text-[11.5px] text-fg-dim">{issue.identifier}</span>
				</div>
				<span className="text-[11px] text-fg-dim">updated {fmtRelativeTime(issue.updated_at)}</span>
			</div>

			<h3 className="px-[14px] pb-[10px] text-[14px] leading-[1.35] font-medium text-fg">
				{issue.title}
			</h3>

			{description ? (
				<p
					className={cn(
						'px-[14px] pb-[12px] text-[12.5px] leading-[1.55] text-fg-muted',
						BODY_CLAMP
					)}
				>
					{description}
				</p>
			) : null}

			{hasLabelsRow ? (
				<div className="flex flex-wrap items-center gap-[5px] px-[14px] pb-[12px]">
					{issue.labels.map((label) => (
						<LabelChip key={label.name} label={label} />
					))}
					{issue.project ? <ProjectTag name={issue.project.name} /> : null}
				</div>
			) : null}

			{hasMetaRow ? (
				<div className="flex items-center gap-3 border-t border-border px-[14px] py-[10px] text-[11.5px] text-fg-muted">
					{assignee ? (
						<span className="inline-flex items-center gap-1.5">
							<Icon name="user" size={11} className="text-fg-dim" />
							<span>Assigned to</span>
							<AssigneeAvatar name={assignee.name} avatarUrl={assignee.avatar_url} size={18} />
							<span className="text-fg">{assignee.name}</span>
						</span>
					) : null}
					{subCount.total > 0 ? <SubCountChip done={subCount.done} total={subCount.total} /> : null}
					{estimate !== null ? <EstimateChip n={estimate} /> : null}
				</div>
			) : null}

			{lastComment ? (
				<div className="flex items-start gap-[9px] border-t border-border bg-surface px-[14px] py-[10px]">
					<AssigneeAvatar
						name={lastComment.author?.name ?? null}
						avatarUrl={lastComment.author?.avatar_url ?? null}
						size={20}
						tint={agentColor(lastComment.author?.name)}
					/>
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-1 text-[12.5px] text-fg-dim">
							<span className="text-fg-muted">{lastComment.author?.name ?? 'Unknown'}</span>
							<span>·</span>
							<span>last comment</span>
							<span>·</span>
							<span>{fmtRelativeTime(lastComment.created_at)}</span>
						</div>
						<p className={cn('mt-0.5 text-[12px] leading-[1.45] text-fg-muted', COMMENT_CLAMP)}>
							{stripMarkdown(lastComment.body)}
						</p>
					</div>
				</div>
			) : (
				<div className="border-t border-border bg-surface px-[14px] py-[10px] text-[12px] text-fg-muted">
					No comments yet · Be the first.
				</div>
			)}

			{linkedRun ? (
				<div className="flex items-center justify-between gap-[7px] border-t border-border bg-void px-[14px] py-[9px]">
					<div className="flex items-center gap-1.5 text-[11px] text-fg-dim">
						<Dot tone="info" pulse size={6} />
						<span className="font-data text-[11px] text-fg">
							run-{shortRunId(linkedRun.run.id)}
						</span>
						<span>·</span>
						<span>{runStateLabel[linkedRun.run.state]}</span>
						{linkedRun.run.started_at ? (
							<>
								<span>·</span>
								<span>{fmtRelativeShort(linkedRun.run.started_at)}</span>
							</>
						) : null}
					</div>
					<button
						type="button"
						onClick={onOpen}
						className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-fg-muted hover:bg-raised hover:text-fg focus-visible:ring-1 focus-visible:ring-accent-soft focus-visible:outline-none"
					>
						<span>Open</span>
						<Icon name="external" size={10} />
					</button>
				</div>
			) : null}
		</div>
	)
}

function shortRunId(id: string): string {
	return id.slice(0, 8)
}

function pickLastComment<T extends { created_at: string }>(comments: T[] | undefined): T | null {
	if (!comments || comments.length === 0) return null
	let latest = comments[0]
	for (const c of comments.slice(1)) {
		if (new Date(c.created_at).getTime() > new Date(latest.created_at).getTime()) {
			latest = c
		}
	}
	return latest
}
