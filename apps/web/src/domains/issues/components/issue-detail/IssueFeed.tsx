import { useMemo, type ReactNode } from 'react'

import { ExternalLink } from '@/components/composites/external-link'
import { HistoryEntryBody } from '@/domains/issues/components/issue-detail/HistoryEntryBody'
import { HistoryTruncatedFooter } from '@/domains/issues/components/issue-detail/HistoryTruncatedFooter'
import { IssueCommentCard } from '@/domains/issues/components/issue-detail/IssueCommentCard'
import { IssueTimelineEvent } from '@/domains/issues/components/issue-detail/IssueTimelineEvent'
import { OpenRunButton } from '@/domains/issues/components/issue-detail/OpenRunButton'
import { PrBadge } from '@/domains/reviews/components/pr/PrBadge'
import { buildIssueActivity, fmtRelativeTime, isAgentName, runNarrative } from '@/lib/domain'
import type {
	ActivityNodeKind,
	ActivityNodeRole,
	IssueActivityItem,
	IssueDetailResponse,
	LinkedRunSummary,
	NarrativeTone,
	RunState
} from '@/types'

interface EventNode {
	key: string
	kind: ActivityNodeKind
	role: ActivityNodeRole
	who: ReactNode
	time?: ReactNode
	isAgent: boolean
	body: ReactNode
}

type FeedNode =
	| { key: string; variant: 'comment'; comment: IssueActivityItem & { kind: 'comment' } }
	| ({ variant: 'event' } & EventNode)

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

function RunLaunchedBody({ runId }: { runId: string }) {
	return (
		<span className="inline-flex items-center gap-x-2 align-middle text-fg-muted">
			launched
			<OpenRunButton runId={runId} />
		</span>
	)
}

function RunCompletedBody({ run }: { run: LinkedRunSummary }) {
	return (
		<span className="inline-flex items-center gap-x-2 align-middle text-fg-muted">
			{completionPhrase(run.state)}
			{run.state === 'completed' && run.pr ? (
				<ExternalLink
					href={run.pr.url}
					className="inline-flex shrink-0 rounded-md hover:opacity-80 focus-visible:ring-2 focus-visible:ring-success/40 focus-visible:outline-none"
				>
					<PrBadge pr={run.pr} />
				</ExternalLink>
			) : null}
			<OpenRunButton runId={run.id} />
		</span>
	)
}

function buildEvent(item: IssueActivityItem): EventNode | null {
	switch (item.kind) {
		case 'comment':
			return null
		case 'run_launched':
			return {
				key: item.key,
				kind: 'system',
				role: 'info',
				who: 'Run',
				time: fmtRelativeTime(item.run.started_at),
				isAgent: false,
				body: <RunLaunchedBody runId={item.run.id} />
			}
		case 'run_completed': {
			const tone = runNarrative(item.run.state).tone
			return {
				key: item.key,
				kind: item.run.state === 'completed' ? 'check' : 'flag',
				role: NARRATIVE_ROLE[tone],
				who: 'Run',
				time: item.run.finished_at ? fmtRelativeTime(item.run.finished_at) : undefined,
				isAgent: false,
				body: <RunCompletedBody run={item.run} />
			}
		}
		case 'history': {
			const actor = item.entry.actor
			return {
				key: item.key,
				kind: 'system',
				role: 'neutral',
				who: actor?.name ?? 'Linear',
				time: fmtRelativeTime(item.entry.created_at),
				isAgent: isAgentName(actor?.name),
				body: <HistoryEntryBody entry={item.entry} />
			}
		}
	}
}

function buildNode(item: IssueActivityItem): FeedNode {
	if (item.kind === 'comment') {
		return { key: item.key, variant: 'comment', comment: item }
	}
	return { variant: 'event', ...buildEvent(item)! }
}

export function IssueFeed({ issue }: { issue: IssueDetailResponse }) {
	const nodes = useMemo(() => {
		const items = buildIssueActivity(issue.comments, issue.linked_runs, issue.history ?? [])
		return items.map(buildNode)
	}, [issue.comments, issue.linked_runs, issue.history])
	const isEmpty = nodes.length === 0
	const showFooter = issue.history_has_more === true
	return (
		<section aria-label="Activity">
			{isEmpty ? (
				<p className="md md--empty">No activity yet.</p>
			) : (
				<div className="feed">
					{nodes.map((node) =>
						node.variant === 'comment' ? (
							<IssueCommentCard key={node.key} node={node.comment.node} />
						) : (
							<IssueTimelineEvent
								key={node.key}
								kind={node.kind}
								role={node.role}
								who={node.who}
								time={node.time}
								isAgent={node.isAgent}
							>
								{node.body}
							</IssueTimelineEvent>
						)
					)}
				</div>
			)}
			{showFooter ? <HistoryTruncatedFooter /> : null}
		</section>
	)
}
