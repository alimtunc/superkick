import { useMemo, type ReactNode } from 'react'

import { ActivityNode } from '@/components/issue-detail/ActivityNode'
import { AuthorAvatar } from '@/components/issue-detail/AuthorAvatar'
import { IssueIntro } from '@/components/issue-detail/IssueIntro'
import { IssueMarkdown } from '@/components/issue-detail/IssueMarkdown'
import { OpenRunActions } from '@/components/issue-detail/OpenRunActions'
import { RunPrBadge } from '@/components/issue-detail/RunPrBadge'
import { RunStateBadge } from '@/components/RunStateBadge'
import { buildIssueActivity, fmtRelativeTime, isTerminalRunState, runNarrative } from '@/lib/domain'
import type {
	ActivityNodeKind,
	ActivityNodeRole,
	CommentNode,
	IssueDetailResponse,
	LinkedRunSummary
} from '@/types'
import { MessageCircle } from 'lucide-react'

function NeedsHumanBody({ run }: { run: LinkedRunSummary }) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			<span className="text-fg">Run is waiting on your decision.</span>
			<OpenRunActions runId={run.id} tone="warn" />
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

function RunNodeBody({ run }: { run: LinkedRunSummary }) {
	const narrative = runNarrative(run.state)
	return (
		<div className="flex flex-wrap items-center gap-2">
			<RunStateBadge state={run.state} />
			<span className="text-[12.5px] text-fg-muted">{narrative.headline}</span>
			{run.pr ? <RunPrBadge pr={run.pr} /> : null}
			<OpenRunActions runId={run.id} tone="accent" />
		</div>
	)
}

interface FeedNode {
	key: string
	kind: ActivityNodeKind
	role: ActivityNodeRole
	who: ReactNode
	time?: ReactNode
	link?: ReactNode
	disc?: ReactNode
	body: ReactNode
}

function buildNodes(issue: IssueDetailResponse): FeedNode[] {
	const nodes: FeedNode[] = []

	const needsHuman = issue.linked_runs
		.filter((r) => r.state === 'waiting_human')
		.toSorted((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())[0]
	if (needsHuman) {
		nodes.push({
			key: `needs-human:${needsHuman.id}`,
			kind: 'flag',
			role: 'warn',
			who: 'Needs your decision',
			time: fmtRelativeTime(needsHuman.started_at),
			body: <NeedsHumanBody run={needsHuman} />
		})
	}

	const items = buildIssueActivity(
		issue.comments,
		issue.linked_runs.filter((r) => isTerminalRunState(r.state))
	)
	for (const item of items) {
		if (item.kind === 'comment') {
			const name = item.node.comment.author?.name ?? 'Unknown'
			nodes.push({
				key: item.key,
				kind: 'user',
				role: 'neutral',
				who: name,
				time: fmtRelativeTime(item.node.comment.created_at),
				disc: <AuthorAvatar name={name} avatarUrl={item.node.comment.author?.avatar_url ?? null} />,
				body: <CommentBody node={item.node} />
			})
		} else {
			const run = item.run
			nodes.push({
				key: item.key,
				kind: 'pr',
				role: isTerminalRunState(run.state) ? 'success' : 'info',
				who: 'Run',
				time: fmtRelativeTime(run.started_at),
				body: <RunNodeBody run={run} />
			})
		}
	}

	return nodes
}

export function IssueFeed({ issue }: { issue: IssueDetailResponse }) {
	const nodes = useMemo(() => buildNodes(issue), [issue])
	const lastIndex = nodes.length - 1
	return (
		<div className="flex flex-col gap-5">
			<IssueIntro issue={issue} />
			{nodes.length > 0 ? (
				<section aria-label="Activity" className="mt-1">
					<header className="mb-3 flex items-center gap-2">
						<MessageCircle
							size={13}
							strokeWidth={1.8}
							className="text-fg-dim"
							aria-hidden="true"
						/>
						<span className="text-[13px] font-semibold text-fg">Activity</span>
						<span className="font-data text-[11px] text-fg-dim">· {nodes.length}</span>
						<span className="ml-auto text-[12px] text-fg-dim">Newest first</span>
					</header>
					<div className="pl-1">
						{nodes.map((node, index) => (
							<ActivityNode
								key={node.key}
								kind={node.kind}
								role={node.role}
								who={node.who}
								time={node.time}
								link={node.link}
								disc={node.disc}
								connect={index < lastIndex}
							>
								{node.body}
							</ActivityNode>
						))}
					</div>
				</section>
			) : null}
		</div>
	)
}
