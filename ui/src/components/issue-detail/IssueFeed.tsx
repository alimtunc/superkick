import { useMemo, type ReactNode } from 'react'

import { ActivityNode } from '@/components/issue-detail/ActivityNode'
import { AuthorAvatar } from '@/components/issue-detail/AuthorAvatar'
import { IssueIntro } from '@/components/issue-detail/IssueIntro'
import { IssueMarkdown } from '@/components/issue-detail/IssueMarkdown'
import { OpenRunActions } from '@/components/issue-detail/OpenRunActions'
import { RunPrBadge } from '@/components/issue-detail/RunPrBadge'
import { buildIssueActivity, fmtRelativeTime, pickLatestRun, runNarrative } from '@/lib/domain'
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
import { Flag, MessageCircle } from 'lucide-react'

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

function RunLaunchedEventBody({ runId }: { runId: string }) {
	return (
		<>
			<span className="text-fg-muted">launched</span>
			<OpenRunActions runId={runId} tone="accent" />
		</>
	)
}

function RunCompletedEventBody({ run }: { run: LinkedRunSummary }) {
	return (
		<>
			<span className="text-fg-muted">{completionPhrase(run.state)}</span>
			{run.state === 'completed' && run.pr ? <RunPrBadge pr={run.pr} /> : null}
			<OpenRunActions runId={run.id} tone="accent" />
		</>
	)
}

function NeedsHumanCallout({ run }: { run: LinkedRunSummary }) {
	return (
		<section
			aria-label="Needs your decision"
			className="rounded-md border border-warn/40 bg-warn-soft/60 px-3.5 py-3"
		>
			<div className="flex flex-wrap items-center gap-2 text-[13px]">
				<Flag size={13} strokeWidth={1.9} className="text-warn" aria-hidden="true" />
				<span className="font-medium text-warn">Needs your decision</span>
				<span className="font-data text-[11px] text-fg-dim">{fmtRelativeTime(run.started_at)}</span>
				<span className="text-fg-muted">Run is waiting on your decision.</span>
				<OpenRunActions runId={run.id} tone="warn" />
			</div>
		</section>
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
				body: <RunLaunchedEventBody runId={item.run.id} />
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
				body: <RunCompletedEventBody run={item.run} />
			}
		}
	}
}

export function IssueFeed({ issue }: { issue: IssueDetailResponse }) {
	const needsHuman = useMemo(
		() => pickLatestRun(issue.linked_runs.filter((r) => r.state === 'waiting_human')),
		[issue.linked_runs]
	)
	const nodes = useMemo(() => {
		const items = buildIssueActivity(issue.comments, issue.linked_runs)
		return items.map(buildNode).toReversed()
	}, [issue.comments, issue.linked_runs])
	const lastIndex = nodes.length - 1
	const isEmpty = nodes.length === 0
	return (
		<div className="flex flex-col gap-5">
			<IssueIntro issue={issue} />
			{needsHuman ? <NeedsHumanCallout run={needsHuman} /> : null}
			<section aria-label="Activity" className="mt-1">
				<header className="mb-3 flex items-center gap-2">
					<MessageCircle size={13} strokeWidth={1.8} className="text-fg-dim" aria-hidden="true" />
					<span className="text-[13px] font-semibold text-fg">Activity</span>
					{isEmpty ? null : (
						<>
							<span className="font-data text-[11px] text-fg-dim">· {nodes.length}</span>
							<span className="ml-auto text-[12px] text-fg-dim">Newest first</span>
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
		</div>
	)
}
