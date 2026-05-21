import { IssueExtraBadges } from '@/components/issues/IssueExtraBadges'
import { SeverityPill } from '@/components/issues/SeverityPill'
import { LaunchQueueBlockerList } from '@/components/launch-queue/LaunchQueueBlockerList'
import { LaunchQueueUnblockBadge } from '@/components/launch-queue/LaunchQueueUnblockBadge'
import { Button } from '@/components/ui/button'
import { taskBadgeFor } from '@/lib/domain'
import { formatShortDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { IssueState, LaunchQueueItem } from '@/types'
import { Avatar } from '@/ui/Avatar'
import { TaskBadge } from '@/ui/TaskBadge'
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
	const canDispatch = item.bucket === 'launchable'
	const dispatchLabel = dispatchPending ? 'Dispatching…' : 'Dispatch'
	const showBlockers = item.bucket === 'blocked' && item.issue.blocked_by.length > 0
	const assigneeName = item.issue.assignee?.name
	const taskKind = taskBadgeFor(item)

	if (props.variant === 'overlay') {
		return (
			<CardSurface
				className={cn(
					'rotate-[-1.3deg] cursor-grabbing border-accent shadow-2xl',
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
				'rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
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
				'flex flex-col gap-2.5 rounded-lg border border-border bg-raised p-3 transition-colors hover:border-border-strong',
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
	const header = (
		<div className="flex items-center gap-2">
			<SeverityPill value={item.issue.priority.value} />
			<span className="font-mono text-[11px] text-fg-dim">{item.issue.identifier}</span>
			<span className="flex-1" />
			<TaskBadge kind={taskKind} mono />
		</div>
	)

	const body = (
		<>
			{header}
			<p className="line-clamp-2 text-[12.5px] leading-snug font-medium text-fg">{item.issue.title}</p>
			<div className="flex items-center gap-2">
				{assigneeName ? <Avatar name={assigneeName} size={18} /> : null}
				<IssueExtraBadges item={item} dispatchPosition={dispatchPosition} />
				<span className="flex-1" />
				<span className="text-[10.5px] text-fg-dim">{formatShortDate(item.issue.updated_at)}</span>
			</div>
		</>
	)

	return (
		<>
			{interactive ? (
				<Link
					to="/issues/$issueId"
					params={{ issueId: item.issue.id }}
					className="flex flex-col gap-2 rounded focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
				>
					{body}
				</Link>
			) : (
				<div className="flex flex-col gap-2">{body}</div>
			)}

			{showBlockers ? <LaunchQueueBlockerList blockers={item.issue.blocked_by} /> : null}
			{unblockedAt ? <LaunchQueueUnblockBadge resolvedAt={unblockedAt} refTime={refTime} /> : null}
			{canDispatch ? (
				<Button
					variant="secondary"
					size="xs"
					disabled={dispatchPending || !interactive}
					onClick={() => onDispatch(item.issue.identifier)}
					className="self-start font-mono text-[11px]"
					aria-label={`Dispatch ${item.issue.identifier}`}
				>
					{dispatchLabel}
				</Button>
			) : null}
		</>
	)
}
