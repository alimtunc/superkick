import { PriorityIcon } from '@/components/issues/PriorityIcon'
import { StatusIcon } from '@/components/issues/StatusIcon'
import { V1IssueBadges } from '@/components/issues/V1IssueBadges'
import { LaunchQueueBlockerList } from '@/components/launch-queue/LaunchQueueBlockerList'
import { LaunchQueueUnblockBadge } from '@/components/launch-queue/LaunchQueueUnblockBadge'
import { LaunchRunBadges } from '@/components/launch-queue/LaunchRunBadges'
import { Button } from '@/components/ui/button'
import { fmtElapsed, stepLabel } from '@/lib/domain'
import type { LaunchQueueItem } from '@/types'
import { Link } from '@tanstack/react-router'

interface V1IssueKanbanCardProps {
	item: LaunchQueueItem
	refTime: number
	onDispatch: (issueIdentifier: string) => void
	dispatchPending: boolean
	unblockedAt: string | undefined
	dispatchPosition: number | undefined
}

/** Kanban card for the V1 issues board (SUP-92). Discriminates on
 *  `item.kind` — issue cards expose Dispatch when launchable; run cards
 *  expose attention/PR badges. Dispatch sits as a sibling to the `<Link>`
 *  to avoid nesting an interactive element inside another. */
export function V1IssueKanbanCard({
	item,
	refTime,
	onDispatch,
	dispatchPending,
	unblockedAt,
	dispatchPosition
}: V1IssueKanbanCardProps) {
	if (item.kind === 'issue') {
		return (
			<IssueKanbanCard
				item={item}
				onDispatch={onDispatch}
				dispatchPending={dispatchPending}
				unblockedAt={unblockedAt}
				refTime={refTime}
				dispatchPosition={dispatchPosition}
			/>
		)
	}
	return <RunKanbanCard item={item} refTime={refTime} />
}

interface IssueKanbanCardProps {
	item: Extract<LaunchQueueItem, { kind: 'issue' }>
	refTime: number
	onDispatch: (issueIdentifier: string) => void
	dispatchPending: boolean
	unblockedAt: string | undefined
	dispatchPosition: number | undefined
}

function IssueKanbanCard({
	item,
	refTime,
	onDispatch,
	dispatchPending,
	unblockedAt,
	dispatchPosition
}: IssueKanbanCardProps) {
	const canDispatch = item.bucket === 'launchable'
	const dispatchLabel = dispatchPending ? 'Dispatching…' : 'Dispatch'
	const showBlockers = item.bucket === 'blocked' && item.issue.blocked_by.length > 0

	return (
		<div className="group flex flex-col gap-1.5 px-3 py-2.5 transition-colors hover:bg-slate-deep/50">
			<Link to="/issues/$issueId" params={{ issueId: item.issue.id }} className="flex flex-col gap-1">
				<div className="flex items-center gap-2">
					<span className="flex w-4 shrink-0 items-center justify-center">
						<PriorityIcon value={item.issue.priority.value} />
					</span>
					<span className="font-data shrink-0 text-[12px] font-medium text-fog transition-colors group-hover:text-neon-green">
						{item.issue.identifier}
					</span>
					<span className="flex w-4 shrink-0 items-center justify-center">
						<StatusIcon
							stateType={item.issue.status.state_type}
							color={item.issue.status.color}
						/>
					</span>
					<span className="font-data truncate text-[11px] text-silver">{item.issue.title}</span>
				</div>
			</Link>
			<V1IssueBadges item={item} dispatchPosition={dispatchPosition} />
			<p className="font-data line-clamp-2 text-[10px] text-dim">{item.reason}</p>
			{showBlockers ? <LaunchQueueBlockerList blockers={item.issue.blocked_by} /> : null}
			{unblockedAt ? <LaunchQueueUnblockBadge resolvedAt={unblockedAt} refTime={refTime} /> : null}
			{canDispatch ? (
				<Button
					variant="secondary"
					size="xs"
					disabled={dispatchPending}
					onClick={() => onDispatch(item.issue.identifier)}
					className="font-data self-start text-[11px]"
					aria-label={`Dispatch ${item.issue.identifier}`}
				>
					{dispatchLabel}
				</Button>
			) : null}
		</div>
	)
}

interface RunKanbanCardProps {
	item: Extract<LaunchQueueItem, { kind: 'run' }>
	refTime: number
}

function RunKanbanCard({ item, refTime }: RunKanbanCardProps) {
	const { run } = item
	const stepText = run.current_step_key ? (stepLabel[run.current_step_key] ?? run.current_step_key) : null
	const linkedIdentifier = item.linked_issue?.identifier ?? run.issue_identifier

	return (
		<div
			className="group flex flex-col gap-1 px-3 py-2.5 transition-colors hover:bg-slate-deep/50"
			title={item.reason}
		>
			<Link to="/runs/$runId" params={{ runId: run.id }} className="flex flex-col gap-1">
				<div className="flex items-center justify-between gap-2">
					<span className="font-data text-[12px] font-medium text-fog transition-colors group-hover:text-neon-green">
						{linkedIdentifier}
					</span>
					<LaunchRunBadges item={item} />
				</div>
				<div className="flex items-center gap-2">
					<span className="font-data truncate text-[10px] text-dim">{run.repo_slug}</span>
					{stepText ? <span className="font-data text-[10px] text-ash">{stepText}</span> : null}
				</div>
				<p className="font-data truncate text-[10px] text-silver">{item.reason}</p>
				<div className="flex items-center justify-between">
					<span className="font-data text-[10px] text-dim">
						{fmtElapsed(run.started_at, refTime)}
					</span>
					{run.branch_name ? (
						<span className="font-data max-w-28 truncate text-[10px] text-dim">
							{run.branch_name}
						</span>
					) : null}
				</div>
			</Link>
		</div>
	)
}
