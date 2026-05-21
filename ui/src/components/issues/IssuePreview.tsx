import { useEffect } from 'react'

import { LabelChip } from '@/components/issue-detail/LabelChip'
import { Pill } from '@/components/ui/pill'
import { fmtRelativeShort } from '@/lib/domain/formatters'
import { issueDetailQuery } from '@/lib/queries'
import { cn } from '@/lib/utils'
import type { IssueWithState, LifecycleBucket } from '@/types'
import { Icon, PriorityIcon, priorityIconKindFromValue, StatusIcon, statusIconKindFromLinear } from '@/ui'
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
	const prUrl = detail?.linked_runs.find((r) => r.pr?.url)?.pr?.url ?? null

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
		<div className="z-popover w-115 overflow-hidden rounded-lg border border-border bg-overlay shadow-xl">
			<div className="flex items-center justify-between gap-2 px-4 pt-3">
				<div className="flex items-center gap-2">
					<PriorityIcon kind={priorityIconKindFromValue(issue.priority.value)} size={13} />
					<StatusIcon kind={statusIconKindFromLinear(issue.status.state_type)} size={13} />
					<span className="font-data text-[11px] text-fg-dim">{issue.identifier}</span>
				</div>
				<span className="font-data text-[11px] text-fg-dim">
					opened {fmtRelativeShort(issue.created_at)}
				</span>
			</div>

			<div className="px-4 pt-1.5">
				<h3 className="text-[14px] font-medium text-fg">{issue.title}</h3>
			</div>

			{detail?.description ? (
				<p className={cn('px-4 pt-2 text-[13px] leading-snug text-fg-muted', BODY_CLAMP)}>
					{detail.description}
				</p>
			) : null}

			{issue.labels.length > 0 ? (
				<div className="flex flex-wrap gap-1 px-4 pt-2">
					{issue.labels.map((label) => (
						<LabelChip key={label.name} label={label} />
					))}
				</div>
			) : null}

			{lastComment ? (
				<div className="border-t border-border px-4 py-2">
					<div className="flex items-center gap-1 text-[11px] text-fg-dim">
						<span>{lastComment.author?.name ?? 'Unknown'}</span>
						<span>·</span>
						<span>last comment</span>
						<span>·</span>
						<span>{fmtRelativeShort(lastComment.created_at)}</span>
					</div>
					<p className={cn('mt-1 text-[12px] leading-snug text-fg-muted', COMMENT_CLAMP)}>
						{lastComment.body}
					</p>
				</div>
			) : null}

			{linkedRun || prUrl ? (
				<div className="flex items-center gap-2 border-t border-border px-4 py-2">
					{linkedRun ? (
						<Pill
							tone="info"
							size="xs"
							leading={
								<span className="live-pulse inline-block size-1.5 rounded-full bg-info motion-reduce:animate-none" />
							}
						>
							{linkedRun.run.state}
						</Pill>
					) : null}
					{prUrl ? (
						<Pill tone="accent" size="xs" leading={<Icon name="pr" size={11} />}>
							PR
						</Pill>
					) : null}
				</div>
			) : null}

			<div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2">
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
		</div>
	)
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
