import type { ReactNode } from 'react'

import { Inline, StatusIcon } from '@/components/primitives'
import { joinWithAnd } from '@/domains/issues/components/issue-detail/joinWithAnd'
import { LabelChip } from '@/domains/issues/components/issue-detail/LabelChip'
import { PRIORITY_META, statusIconKindFromLinear } from '@/lib/domain'
import { formatLongDate } from '@/lib/format'
import type {
	CycleRef,
	IssueAssignee,
	IssueHistoryEvent,
	IssueLabel,
	ProjectRef,
	WorkflowStateRef
} from '@/types'

export function formatHistoryEvent(event: IssueHistoryEvent, actor: IssueAssignee | null): ReactNode {
	switch (event.kind) {
		case 'created':
			return 'created the issue'
		case 'description_edited':
			return 'updated the description'
		case 'status_changed':
			return formatStatus(event.from, event.to)
		case 'assignee_changed':
			return formatAssignee(event.from, event.to, actor)
		case 'priority_changed':
			return formatPriority(event.from, event.to)
		case 'labels_changed':
			return formatLabels(event.added, event.removed)
		case 'project_changed':
			return formatProject(event.from, event.to)
		case 'cycle_changed':
			return formatCycle(event.from, event.to)
		case 'estimate_changed':
			return formatEstimate(event.from, event.to)
		case 'due_date_changed':
			return formatDueDate(event.from, event.to)
		case 'title_changed':
			return formatTitle(event.to)
	}
}

function InlineStatus({ status }: { status: WorkflowStateRef }) {
	return (
		<Inline>
			<StatusIcon kind={statusIconKindFromLinear(status.state_type)} size={12} />
			{status.name}
		</Inline>
	)
}

function formatStatus(from: WorkflowStateRef, to: WorkflowStateRef): ReactNode {
	const fromInit = from.state_type === 'backlog' || from.state_type === 'unstarted'
	if (fromInit) {
		return (
			<>
				set status to <InlineStatus status={to} />
			</>
		)
	}
	return (
		<>
			changed status from <InlineStatus status={from} /> to <InlineStatus status={to} />
		</>
	)
}

function formatAssignee(
	from: IssueAssignee | null,
	to: IssueAssignee | null,
	actor: IssueAssignee | null
): ReactNode {
	if (to && actor && actor.id === to.id && (from === null || from.id !== to.id)) {
		return 'self-assigned the issue'
	}
	if (from && !to) {
		return 'removed the assignee'
	}
	if (!from && to) {
		return <>assigned the issue to {to.name}</>
	}
	if (from && to) {
		return (
			<>
				changed assignee from {from.name} to {to.name}
			</>
		)
	}
	return 'changed the assignee'
}

function priorityLabel(value: number): string {
	return PRIORITY_META[value]?.label ?? `P${value}`
}

function formatPriority(from: number, to: number): ReactNode {
	if (from === 0) return <>set priority to {priorityLabel(to)}</>
	if (to === 0) return 'removed the priority'
	const verb = to < from ? 'raised' : 'lowered'
	return (
		<>
			{verb} priority from {priorityLabel(from)} to {priorityLabel(to)}
		</>
	)
}

function formatLabels(added: IssueLabel[], removed: IssueLabel[]): ReactNode {
	const phrases: ReactNode[] = []
	if (added.length > 0) {
		phrases.push(
			<span key="added">
				added {joinWithAnd(added.map((l) => <LabelChip key={`add-${l.name}`} label={l} />))}
			</span>
		)
	}
	if (removed.length > 0) {
		phrases.push(
			<span key="removed">
				removed {joinWithAnd(removed.map((l) => <LabelChip key={`rem-${l.name}`} label={l} />))}
			</span>
		)
	}
	return joinWithAnd(phrases)
}

function formatProject(from: ProjectRef | null, to: ProjectRef | null): ReactNode {
	if (!from && to) return <>added to project {to.name}</>
	if (from && !to) return <>removed from project {from.name}</>
	if (from && to) {
		return (
			<>
				moved from project {from.name} to {to.name}
			</>
		)
	}
	return 'changed the project'
}

function formatCycle(from: CycleRef | null, to: CycleRef | null): ReactNode {
	if (!from && to) return <>added to {cycleLabel(to)}</>
	if (from && !to) return <>removed from {cycleLabel(from)}</>
	if (from && to) {
		return (
			<>
				moved from {cycleLabel(from)} to {cycleLabel(to)}
			</>
		)
	}
	return 'changed the cycle'
}

function cycleLabel(ref: CycleRef): string {
	return ref.name ?? `cycle ${ref.number}`
}

function pointsLabel(n: number): string {
	return `${n} ${n === 1 ? 'point' : 'points'}`
}

function formatEstimate(from: number | null, to: number | null): ReactNode {
	if (from === null && to !== null) return <>estimated complexity as {pointsLabel(to)}</>
	if (from !== null && to === null) return 'removed the estimate'
	if (from !== null && to !== null) {
		const verb = to > from ? 'increased' : 'decreased'
		return (
			<>
				{verb} estimate from {pointsLabel(from)} to {pointsLabel(to)}
			</>
		)
	}
	return 'changed the estimate'
}

function formatDueDate(from: string | null, to: string | null): ReactNode {
	if (!from && to) return <>set the due date to {formatLongDate(to)}</>
	if (from && !to) return 'removed the due date'
	if (from && to) {
		return (
			<>
				changed the due date from {formatLongDate(from)} to {formatLongDate(to)}
			</>
		)
	}
	return 'changed the due date'
}

function formatTitle(to: string): ReactNode {
	return <>changed title to {to}</>
}
