import { useMemo, type ReactNode } from 'react'

import { ActivityNode } from '@/components/issue-detail/ActivityNode'
import { AuthorAvatar } from '@/components/issue-detail/AuthorAvatar'
import { ChildIssues } from '@/components/issue-detail/ChildIssues'
import { IssueDescription } from '@/components/issue-detail/IssueDescription'
import { LaunchTaskFeed } from '@/components/issue-detail/launch-task-feed'
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
import { Link } from '@tanstack/react-router'

function NeedsHumanBody({ run }: { run: LinkedRunSummary }) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			<span className="text-fg">Run is waiting on your decision.</span>
			<Link
				to="/runs/$runId"
				params={{ runId: run.id }}
				className="font-data text-[11.5px] text-warn hover:underline focus-visible:outline-none"
			>
				Open run →
			</Link>
		</div>
	)
}

function CommentBody({ node }: { node: CommentNode }) {
	return (
		<>
			<pre className="font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-fg-muted">
				{node.comment.body}
			</pre>
			{node.children.length > 0 ? (
				<div className="mt-3 space-y-3 border-l border-border pl-3.5">
					{node.children.map((child) => (
						<CommentReply key={child.comment.id} node={child} />
					))}
				</div>
			) : null}
		</>
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
				<pre className="font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-fg-muted">
					{node.comment.body}
				</pre>
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
			<Link
				to="/runs/$runId"
				params={{ runId: run.id }}
				className="font-data ml-auto text-[11.5px] text-accent hover:underline focus-visible:outline-none"
			>
				Open run →
			</Link>
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

	if (issue.description.trim()) {
		nodes.push({
			key: 'description',
			kind: 'user',
			role: 'neutral',
			who: 'Issue description',
			time: fmtRelativeTime(issue.created_at),
			body: <IssueDescription description={issue.description} />
		})
	}

	if (issue.children.length > 0) {
		nodes.push({
			key: 'children',
			kind: 'system',
			role: 'info',
			who: 'Sub-issues',
			body: <ChildIssues issues={issue.children} />
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

	const activeRun = issue.linked_runs.find((r) => !isTerminalRunState(r.state))
	if (activeRun) {
		nodes.push({
			key: `active:${activeRun.id}`,
			kind: 'agent',
			role: 'accent',
			who: 'Active run',
			time: fmtRelativeTime(activeRun.started_at),
			body: <RunNodeBody run={activeRun} />
		})
	}

	nodes.push({
		key: 'launch-task',
		kind: 'system',
		role: 'accent',
		who: 'Launch task',
		body: <LaunchTaskFeed issueIdentifier={issue.identifier} />
	})

	return nodes
}

export function IssueFeed({ issue }: { issue: IssueDetailResponse }) {
	const nodes = useMemo(() => buildNodes(issue), [issue])
	const lastIndex = nodes.length - 1
	return (
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
	)
}
