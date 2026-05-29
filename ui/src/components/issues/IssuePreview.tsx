import { useEffect } from 'react'

import { LabelChip } from '@/components/issue-detail/LabelChip'
import { AssigneeAvatar } from '@/components/issues/AssigneeAvatar'
import { ProjectTag } from '@/components/issues/ProjectTag'
import { TaskDot } from '@/components/issues/TaskDot'
import { agentColor } from '@/lib/domain/agentColor'
import { runStateLabel } from '@/lib/domain/displayLabels'
import { fmtRelativeShort, fmtRelativeTime } from '@/lib/domain/formatters'
import { subIssueCount } from '@/lib/issues/subIssues'
import { taskBadgeKindFor } from '@/lib/issues/taskBadge'
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
	const issue = wrapper.issue
	const navigate = useNavigate()
	const taskKind = taskBadgeKindFor(wrapper, bucket)
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
	const hasLabelsRow = issue.labels.length > 0 || issue.project !== null
	const description = detail?.description ? stripMarkdown(detail.description) : ''

	function onOpen(event: React.MouseEvent) {
		event.preventDefault()
		event.stopPropagation()
		navigate({ to: '/issues/$issueId', params: { issueId: issue.identifier } })
	}

	return (
		<div className="preview-card z-popover">
			<div className="preview-card__head">
				<PriorityIcon kind={priorityIconKindFromValue(issue.priority.value)} size={16} />
				<StatusIcon kind={statusIconKindFor(issue.status)} size={16} />
				<span className="preview-card__id mono">{issue.identifier}</span>
				<span className="spacer" />
				{taskKind ? <TaskDot kind={taskKind} /> : null}
			</div>

			<h3 className="preview-card__title">{issue.title}</h3>

			{description ? <p className={cn('preview-card__desc', BODY_CLAMP)}>{description}</p> : null}

			{hasLabelsRow || assignee ? (
				<div className="preview-card__foot">
					{issue.labels.map((label) => (
						<LabelChip key={label.name} label={label} />
					))}
					{issue.project ? <ProjectTag name={issue.project.name} /> : null}
					<span className="spacer" style={{ flex: 1 }} />
					{assignee ? (
						<AssigneeAvatar name={assignee.name} avatarUrl={assignee.avatar_url} size={16} />
					) : null}
					<span>{fmtRelativeTime(issue.updated_at)}</span>
				</div>
			) : null}

			{subCount.total > 0 || estimate !== null ? (
				<div className="preview-card__foot">
					{subCount.total > 0 ? <SubCountChip done={subCount.done} total={subCount.total} /> : null}
					{estimate !== null ? <EstimateChip n={estimate} /> : null}
				</div>
			) : null}

			{lastComment ? (
				<div className="preview-card__foot items-start">
					<AssigneeAvatar
						name={lastComment.author?.name ?? null}
						avatarUrl={lastComment.author?.avatar_url ?? null}
						size={20}
						tint={agentColor(lastComment.author?.name)}
					/>
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-1 text-[12px] text-fg-dim">
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
			) : null}

			{linkedRun ? (
				<div className="preview-card__foot">
					<Dot tone="info" pulse size={6} />
					<span className="font-data text-[11px] text-fg">run-{shortRunId(linkedRun.run.id)}</span>
					<span>·</span>
					<span>{runStateLabel[linkedRun.run.state]}</span>
					{linkedRun.run.started_at ? (
						<>
							<span>·</span>
							<span>{fmtRelativeShort(linkedRun.run.started_at)}</span>
						</>
					) : null}
					<span className="spacer" style={{ flex: 1 }} />
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
