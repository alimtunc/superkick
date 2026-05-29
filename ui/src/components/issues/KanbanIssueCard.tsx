import { IssueExtraBadges } from '@/components/issues/IssueExtraBadges'
import { TaskDot } from '@/components/issues/TaskDot'
import { LaunchQueueBlockerList } from '@/components/launch-queue/LaunchQueueBlockerList'
import { LaunchQueueUnblockBadge } from '@/components/launch-queue/LaunchQueueUnblockBadge'
import { Button } from '@/components/ui/button'
import { taskBadgeFor } from '@/lib/domain'
import { fmtRelativeShort } from '@/lib/domain/formatters'
import { FEATURES } from '@/lib/features'
import { subIssueCount } from '@/lib/issues/subIssues'
import { cn } from '@/lib/utils'
import type { IssueState, LaunchQueueItem } from '@/types'
import { PriorityIcon, priorityIconKindFromValue } from '@/ui'
import { Avatar } from '@/ui/Avatar'
import { useDraggable } from '@dnd-kit/core'
import { Link } from '@tanstack/react-router'

interface KanbanIssueCardBaseProps {
	item: Extract<LaunchQueueItem, { kind: 'issue' }>
	refTime: number
	onDispatch: (issueIdentifier: string) => void
	dispatchPending: boolean
	unblockedAt: string | undefined
	dispatchPosition: number | undefined
}

type KanbanIssueCardProps =
	| (KanbanIssueCardBaseProps & { variant?: 'column'; state: IssueState })
	| (KanbanIssueCardBaseProps & { variant: 'overlay' })

export function KanbanIssueCard(props: KanbanIssueCardProps) {
	const { item, refTime, onDispatch, dispatchPending, unblockedAt, dispatchPosition } = props
	const canDispatch = FEATURES.kanbanCardLaunch && item.bucket === 'launchable'
	const dispatchLabel = dispatchPending ? 'Dispatching…' : 'Dispatch'
	const showBlockers = item.bucket === 'blocked' && item.issue.blocked_by.length > 0
	const assigneeName = item.issue.assignee?.name
	const taskKind = taskBadgeFor(item)

	if (props.variant === 'overlay') {
		return (
			<CardSurface
				className={cn(
					'rotate-[-1.2deg] cursor-grabbing border-accent shadow-2xl',
					'transition-transform motion-reduce:rotate-0 motion-reduce:shadow-none motion-reduce:transition-none'
				)}
			>
				<CardBody
					item={item}
					refTime={refTime}
					unblockedAt={unblockedAt}
					showBlockers={showBlockers}
					assigneeName={assigneeName}
					dispatchPosition={dispatchPosition}
					taskKind={taskKind}
					canDispatch={canDispatch}
					dispatchPending={dispatchPending}
					dispatchLabel={dispatchLabel}
					onDispatch={onDispatch}
					interactive={false}
				/>
			</CardSurface>
		)
	}

	return (
		<DraggableCard identifier={item.issue.identifier} state={props.state}>
			<CardBody
				item={item}
				refTime={refTime}
				unblockedAt={unblockedAt}
				showBlockers={showBlockers}
				assigneeName={assigneeName}
				dispatchPosition={dispatchPosition}
				taskKind={taskKind}
				canDispatch={canDispatch}
				dispatchPending={dispatchPending}
				dispatchLabel={dispatchLabel}
				onDispatch={onDispatch}
				interactive={true}
			/>
		</DraggableCard>
	)
}

interface DraggableCardProps {
	identifier: string
	state: IssueState
	children: React.ReactNode
}

function DraggableCard({ identifier, state, children }: DraggableCardProps) {
	const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
		id: identifier,
		data: { fromState: state }
	})

	return (
		<div
			ref={setNodeRef}
			{...attributes}
			{...listeners}
			className={cn(
				'rounded-[7px] outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
				isDragging ? 'opacity-50' : null
			)}
			aria-label={`${identifier} — drag to move, press space to lift with keyboard`}
		>
			<CardSurface className="cursor-grab active:cursor-grabbing">{children}</CardSurface>
		</div>
	)
}

function CardSurface({ className, children }: { className?: string; children: React.ReactNode }) {
	return (
		<div
			className={cn(
				'flex flex-col gap-1.5 rounded-[7px] border border-border bg-surface px-2.5 py-2 shadow-[0_1px_0_rgba(0,0,0,0.03)]',
				className
			)}
		>
			{children}
		</div>
	)
}

interface CardBodyProps {
	item: Extract<LaunchQueueItem, { kind: 'issue' }>
	refTime: number
	unblockedAt: string | undefined
	showBlockers: boolean
	assigneeName: string | undefined
	dispatchPosition: number | undefined
	taskKind: ReturnType<typeof taskBadgeFor>
	canDispatch: boolean
	dispatchPending: boolean
	dispatchLabel: string
	onDispatch: (issueIdentifier: string) => void
	interactive: boolean
}

function CardBody({
	item,
	refTime,
	unblockedAt,
	showBlockers,
	assigneeName,
	dispatchPosition,
	taskKind,
	canDispatch,
	dispatchPending,
	dispatchLabel,
	onDispatch,
	interactive
}: CardBodyProps) {
	const issue = item.issue
	const label = issue.labels.at(0)
	const sub = subIssueCount(issue.children)

	const header = (
		<div className="flex items-center gap-1.5">
			<PriorityIcon kind={priorityIconKindFromValue(issue.priority.value)} size={11} />
			<span className="font-data text-[10.5px] text-fg-dim">{issue.identifier}</span>
			<span className="flex-1" />
			{taskKind ? <TaskDot kind={taskKind} size={7} /> : null}
		</div>
	)

	const body = (
		<>
			{header}
			<p className="truncate text-[12.5px] leading-[1.3] text-fg">{issue.title}</p>
			<div className="flex items-center gap-1.5">
				{label ? (
					<span className="font-data inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-px text-[10.5px] text-fg-muted">
						<span
							aria-hidden="true"
							className="inline-block size-1.5 rounded-full"
							style={{ backgroundColor: label.color }}
						/>
						<span className="max-w-20 truncate">{label.name}</span>
					</span>
				) : null}
				{FEATURES.kanbanGatingPills ? (
					<IssueExtraBadges item={item} dispatchPosition={dispatchPosition} />
				) : null}
				<span className="flex-1" />
				{sub.total > 0 ? (
					<span className="font-data text-[10.5px] text-fg-dim">
						{sub.done}/{sub.total}
					</span>
				) : null}
				{assigneeName ? <Avatar name={assigneeName} size={16} /> : null}
				<span className="font-data text-[10.5px] text-fg-dim">
					{fmtRelativeShort(issue.updated_at, refTime)}
				</span>
			</div>
		</>
	)

	return (
		<>
			{interactive ? (
				<Link
					to="/issues/$issueId"
					params={{ issueId: issue.id }}
					className="flex flex-col gap-1.5 rounded focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
				>
					{body}
				</Link>
			) : (
				<div className="flex flex-col gap-1.5">{body}</div>
			)}

			{showBlockers ? <LaunchQueueBlockerList blockers={issue.blocked_by} /> : null}
			{unblockedAt ? <LaunchQueueUnblockBadge resolvedAt={unblockedAt} refTime={refTime} /> : null}
			{canDispatch ? (
				<Button
					variant="secondary"
					size="xs"
					disabled={dispatchPending || !interactive}
					onClick={() => onDispatch(issue.identifier)}
					className="self-start font-mono text-[11px]"
					aria-label={`Dispatch ${issue.identifier}`}
				>
					{dispatchLabel}
				</Button>
			) : null}
		</>
	)
}
