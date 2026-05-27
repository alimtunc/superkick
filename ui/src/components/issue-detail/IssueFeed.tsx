import { useMemo, type ReactNode } from 'react'

import { ActivityNode } from '@/components/issue-detail/ActivityNode'
import { AuthorAvatar } from '@/components/issue-detail/AuthorAvatar'
import { IssueMarkdown } from '@/components/issue-detail/IssueMarkdown'
import { OpenRunButton } from '@/components/issue-detail/OpenRunButton'
import { RunPrBadge } from '@/components/issue-detail/RunPrBadge'
import { buildIssueActivity, fmtRelativeTime, runNarrative } from '@/lib/domain'
import type {
	ActivityNodeKind,
	ActivityNodeRole,
	CommentNode,
	IssueActivityItem,
	IssueDetailResponse,
	LinkedRunSummary,
	NarrativeTone,
	RunState
} from '@/types'
import { MessageCircle } from 'lucide-react'

interface FeedNode {
	key: string
	kind: ActivityNodeKind
	role: ActivityNodeRole
	variant: 'comment' | 'event'
	who: ReactNode
	time?: ReactNode
	disc?: ReactNode
	body: ReactNode
}

const NARRATIVE_ROLE: Record<NarrativeTone, ActivityNodeRole> = {
	idle: 'neutral',
	active: 'info',
	attention: 'warn',
	success: 'success',
	failure: 'danger'
}

function completionPhrase(state: RunState): string {
	switch (state) {
		case 'completed':
			return 'completed'
		case 'failed':
			return 'failed'
		case 'cancelled':
			return 'cancelled'
		default:
			return 'finished'
	}
}

function CommentReply({ node }: { node: CommentNode }) {
	const name = node.comment.author?.name ?? 'Unknown'
	return (
		<div className="flex gap-2.5">
			<AuthorAvatar name={name} avatarUrl={node.comment.author?.avatar_url ?? null} />
			<div className="min-w-0 flex-1">
				<div className="flex items-baseline gap-2 text-[12px]">
					<span className="font-medium text-fg">{name}</span>
					<span className="font-data text-[11px] text-fg-dim">
						{fmtRelativeTime(node.comment.created_at)}
					</span>
				</div>
				<IssueMarkdown text={node.comment.body} compact className="mt-1 text-[13px]" />
			</div>
		</div>
	)
}

function CommentBody({ node }: { node: CommentNode }) {
	return (
		<div className="rounded-md border border-border bg-surface px-3 py-2.5">
			<IssueMarkdown text={node.comment.body} compact className="text-[13px]" />
			{node.children.length > 0 ? (
				<div className="mt-3 space-y-3 border-l border-border pl-3.5">
					{node.children.map((child) => (
						<CommentReply key={child.comment.id} node={child} />
					))}
				</div>
			) : null}
		</div>
	)
}

function RunLaunchedBody({ runId }: { runId: string }) {
	return (
		<>
			<span className="text-fg-muted">launched</span>
			<OpenRunButton runId={runId} />
		</>
	)
}

function RunCompletedBody({ run }: { run: LinkedRunSummary }) {
	return (
		<>
			<span className="text-fg-muted">{completionPhrase(run.state)}</span>
			{run.state === 'completed' && run.pr ? <RunPrBadge pr={run.pr} /> : null}
			<OpenRunButton runId={run.id} />
		</>
	)
}

function buildNode(item: IssueActivityItem): FeedNode {
	switch (item.kind) {
		case 'comment': {
			const name = item.node.comment.author?.name ?? 'Unknown'
			return {
				key: item.key,
				kind: 'user',
				role: 'neutral',
				variant: 'comment',
				who: name,
				time: fmtRelativeTime(item.node.comment.created_at),
				disc: <AuthorAvatar name={name} avatarUrl={item.node.comment.author?.avatar_url ?? null} />,
				body: <CommentBody node={item.node} />
			}
		}
		case 'run_launched':
			return {
				key: item.key,
				kind: 'system',
				role: 'info',
				variant: 'event',
				who: 'Run',
				time: fmtRelativeTime(item.run.started_at),
				body: <RunLaunchedBody runId={item.run.id} />
			}
		case 'run_completed': {
			const tone = runNarrative(item.run.state).tone
			return {
				key: item.key,
				kind: item.run.state === 'completed' ? 'check' : 'flag',
				role: NARRATIVE_ROLE[tone],
				variant: 'event',
				who: 'Run',
				time: item.run.finished_at ? fmtRelativeTime(item.run.finished_at) : undefined,
				body: <RunCompletedBody run={item.run} />
			}
		}
	}
}

export function IssueFeed({ issue }: { issue: IssueDetailResponse }) {
	const nodes = useMemo(() => {
		const items = buildIssueActivity(issue.comments, issue.linked_runs)
		const oldestFirst = items.toSorted((a, b) => a.ts - b.ts)
		return oldestFirst.map(buildNode)
	}, [issue.comments, issue.linked_runs])
	const lastIndex = nodes.length - 1
	const isEmpty = nodes.length === 0
	return (
		<section aria-label="Activity">
			<header className="mb-3 flex items-center gap-1.5">
				<MessageCircle size={13} strokeWidth={1.8} className="text-fg-dim" aria-hidden="true" />
				<span className="text-[13px] font-semibold text-fg">Activity</span>
				{isEmpty ? null : (
					<>
						<span className="font-data text-[11px] text-fg-dim" aria-hidden="true">
							·
						</span>
						<span className="font-data text-[11px] text-fg-dim">{nodes.length}</span>
					</>
				)}
			</header>
			{isEmpty ? (
				<p className="text-[12px] text-fg-dim">No activity yet.</p>
			) : (
				<div className="pl-1">
					{nodes.map((node, index) => (
						<ActivityNode
							key={node.key}
							kind={node.kind}
							role={node.role}
							variant={node.variant}
							who={node.who}
							time={node.time}
							disc={node.disc}
							connect={index < lastIndex}
						>
							{node.body}
						</ActivityNode>
					))}
				</div>
			)}
		</section>
	)
}
