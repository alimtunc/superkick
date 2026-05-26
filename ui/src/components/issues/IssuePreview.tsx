import { useEffect } from 'react'

import { LabelChip } from '@/components/issue-detail/LabelChip'
import { fmtRelativeShort, fmtRelativeTime } from '@/lib/domain/formatters'
import { stripMarkdown } from '@/lib/markdown'
import { issueDetailQuery } from '@/lib/queries'
import { cn } from '@/lib/utils'
import type { IssueWithState, LifecycleBucket } from '@/types'
import { Icon, PriorityIcon, priorityIconKindFromValue, StatusIcon, statusIconKindFor } from '@/ui'
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
	const subCount = issue.children.length
	const hasMetaRow = assignee !== null || subCount > 0
	const hasLabelsRow = issue.labels.length > 0 || issue.project !== null
	const description = detail?.description ? stripMarkdown(detail.description) : ''

	function onLaunch(event: React.MouseEvent) {
		event.preventDefault()
		event.stopPropagation()
		navigate({ to: '/tasks/new', search: { issue: issue.identifier } })
	}

	function onOpen(event: React.MouseEvent) {
		event.preventDefault()
		event.stopPropagation()
		navigate({ to: '/issues/$issueId', params: { issueId: issue.identifier } })
	}

	return (
		<div className="z-popover w-120 overflow-hidden rounded-lg border border-border bg-overlay shadow-xl">
			<div className="px-5 pt-4 pb-4">
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-2">
						<PriorityIcon kind={priorityIconKindFromValue(issue.priority.value)} size={13} />
						<StatusIcon kind={statusIconKindFor(issue.status)} size={13} />
						<span className="font-data text-[11px] text-fg-dim">{issue.identifier}</span>
					</div>
					<span className="text-[11px] text-fg-dim">
						updated {fmtRelativeTime(issue.updated_at)}
					</span>
				</div>

				<h3 className="mt-2 text-[14px] font-medium text-fg">{issue.title}</h3>

				{description ? (
					<p className={cn('mt-2.5 text-[13px] leading-snug text-fg-muted', BODY_CLAMP)}>
						{description}
					</p>
				) : null}

				{hasLabelsRow ? (
					<div className="mt-3 flex flex-wrap items-center gap-1.5">
						{issue.labels.map((label) => (
							<LabelChip key={label.name} label={label} />
						))}
						{issue.project ? (
							<span className="font-data inline-flex items-center gap-1 text-[11px] text-fg-dim">
								<Icon name="folder" size={11} />
								{issue.project.name}
							</span>
						) : null}
					</div>
				) : null}

				{hasMetaRow ? (
					<div className="mt-2.5 flex items-center gap-3 text-[11px] text-fg-dim">
						{assignee ? (
							<span className="inline-flex items-center gap-1.5">
								<Icon name="user" size={11} />
								<span className="text-fg-muted">Assigned to</span>
								<AssigneeAvatar name={assignee.name} avatarUrl={assignee.avatar_url} />
								<span className="text-fg">{assignee.name}</span>
							</span>
						) : null}
						{subCount > 0 ? (
							<span className="font-data inline-flex items-center gap-1">
								<Icon name="branch" size={11} />
								<span>
									{subCount} sub-issue{subCount === 1 ? '' : 's'}
								</span>
							</span>
						) : null}
					</div>
				) : null}
			</div>

			{lastComment ? (
				<div className="flex items-start gap-2.5 border-t border-border px-5 py-3">
					<AssigneeAvatar
						name={lastComment.author?.name ?? '?'}
						avatarUrl={lastComment.author?.avatar_url ?? null}
					/>
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-1 text-[11px] text-fg-dim">
							<span className="text-fg-muted">{lastComment.author?.name ?? 'Unknown'}</span>
							<span>·</span>
							<span>last comment</span>
							<span>·</span>
							<span>{fmtRelativeTime(lastComment.created_at)}</span>
						</div>
						<p className={cn('mt-1 text-[12px] leading-snug text-fg-muted', COMMENT_CLAMP)}>
							{stripMarkdown(lastComment.body)}
						</p>
					</div>
				</div>
			) : null}

			{linkedRun ? (
				<div className="flex items-center justify-between gap-2 border-t border-border bg-canvas px-5 py-2.5">
					<div className="flex items-center gap-1.5 text-[11px] text-fg-dim">
						<span className="live-pulse inline-block size-1.5 rounded-full bg-info motion-reduce:animate-none" />
						<span className="font-data text-[11px] text-fg">
							run-{shortRunId(linkedRun.run.id)}
						</span>
						<span>·</span>
						<span>{linkedRun.run.state}</span>
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
			) : (
				<div className="flex items-center justify-end gap-2 border-t border-border px-4 py-2.5">
					<button
						type="button"
						onClick={onOpen}
						className="inline-flex h-7 items-center rounded px-2 text-[12px] text-fg-muted hover:bg-raised hover:text-fg focus-visible:ring-1 focus-visible:ring-accent-soft focus-visible:outline-none"
					>
						Open
					</button>
					<button
						type="button"
						onClick={onLaunch}
						className="inline-flex h-7 items-center gap-1 rounded bg-accent px-2 text-[12px] font-medium text-canvas hover:opacity-90 focus-visible:ring-1 focus-visible:ring-accent-soft focus-visible:outline-none"
					>
						<Icon name="zap" size={11} />
						<span>Launch task</span>
					</button>
				</div>
			)}
		</div>
	)
}

function AssigneeAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
	if (avatarUrl) {
		return (
			<img
				src={avatarUrl}
				alt=""
				className="size-4 rounded-full object-cover"
				loading="lazy"
				decoding="async"
			/>
		)
	}
	return (
		<span className="inline-flex size-4 items-center justify-center rounded-full bg-raised text-[9px] font-medium text-fg-muted">
			{name.slice(0, 1).toUpperCase()}
		</span>
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
