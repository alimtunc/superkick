import { useCallback, useMemo, useState } from 'react'

import { useUpdateIssueState } from '@/hooks/useUpdateIssueState'
import {
	ISSUE_STATE_ORDER,
	isDroppableIssueState,
	issueStateAccent,
	launchQueueItemIdentifier
} from '@/lib/domain'
import type { IssueState, IssueStateMutable, LaunchQueueItem } from '@/types'
import {
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
	type Announcements,
	type DragCancelEvent,
	type DragEndEvent,
	type DragStartEvent,
	type KeyboardCoordinateGetter
} from '@dnd-kit/core'
import { toast } from 'sonner'

interface UseIssueKanbanDndParams {
	groups: Record<IssueState, LaunchQueueItem[]>
}

interface UseIssueKanbanDndResult {
	activeIdentifier: string | null
	activeFromState: IssueState | null
	sensors: ReturnType<typeof useSensors>
	accessibility: { announcements: Announcements }
	onDragStart: (event: DragStartEvent) => void
	onDragEnd: (event: DragEndEvent) => void
	onDragCancel: (event: DragCancelEvent) => void
}

const COLUMN_X_STEP = 280

export function useIssueKanbanDnd({ groups }: UseIssueKanbanDndParams): UseIssueKanbanDndResult {
	const updateState = useUpdateIssueState()
	const [activeIdentifier, setActiveIdentifier] = useState<string | null>(null)
	const [activeFromState, setActiveFromState] = useState<IssueState | null>(null)

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
		useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinateGetter })
	)

	const accessibility = useMemo<{ announcements: Announcements }>(
		() => ({
			announcements: {
				onDragStart: ({ active }) => {
					const from = readFromState(active.data.current)
					return from
						? `Picked up ${active.id} from ${issueStateAccent[from].label}.`
						: `Picked up ${active.id}.`
				},
				onDragOver: ({ active, over }) => {
					if (!over) return `${active.id} is over no column.`
					const target = over.id as IssueState
					if (!isDroppableIssueState(target)) {
						return `${active.id} is over ${issueStateAccent[target].label} — not droppable.`
					}
					return `${active.id} is over ${issueStateAccent[target].label}.`
				},
				onDragEnd: ({ active, over }) => {
					if (!over) return `${active.id} dropped outside a column. Reverted.`
					return `${active.id} dropped on ${issueStateAccent[over.id as IssueState].label}.`
				},
				onDragCancel: ({ active }) => `Drag of ${active.id} cancelled.`
			}
		}),
		[]
	)

	const onDragStart = useCallback((event: DragStartEvent) => {
		setActiveIdentifier(String(event.active.id))
		setActiveFromState(readFromState(event.active.data.current) ?? null)
	}, [])

	const onDragCancel = useCallback((_event: DragCancelEvent) => {
		setActiveIdentifier(null)
		setActiveFromState(null)
	}, [])

	const onDragEnd = useCallback(
		(event: DragEndEvent) => {
			setActiveIdentifier(null)
			setActiveFromState(null)
			const { active, over } = event
			if (!over) return
			const identifier = String(active.id)
			const target = over.id as IssueState
			const from = readFromState(active.data.current)

			if (from === target) return

			if (!isDroppableIssueState(target)) {
				toast.info('Column is read-only', {
					description: `${issueStateAccent[target].label} is derived from run state — manage it from the launch task.`
				})
				return
			}

			const item = findItem(groups, identifier)
			if (!item || item.kind !== 'issue') return

			updateState.mutate({
				issueId: item.issue.id,
				issueIdentifier: identifier,
				teamId: item.issue.team_id,
				to: target as IssueStateMutable
			})
		},
		[groups, updateState]
	)

	return {
		activeIdentifier,
		activeFromState,
		sensors,
		accessibility,
		onDragStart,
		onDragEnd,
		onDragCancel
	}
}

function readFromState(data: unknown): IssueState | undefined {
	return (data as { fromState?: IssueState } | undefined)?.fromState
}

/** Snap X to a column-width step so one arrow press crosses a column boundary (dnd-kit's 25px default stays inside). */
const keyboardCoordinateGetter: KeyboardCoordinateGetter = (event, { currentCoordinates }) => {
	switch (event.code) {
		case 'ArrowRight':
			return { ...currentCoordinates, x: currentCoordinates.x + COLUMN_X_STEP }
		case 'ArrowLeft':
			return { ...currentCoordinates, x: currentCoordinates.x - COLUMN_X_STEP }
		case 'ArrowDown':
			return { ...currentCoordinates, y: currentCoordinates.y + 80 }
		case 'ArrowUp':
			return { ...currentCoordinates, y: currentCoordinates.y - 80 }
		default:
			return undefined
	}
}

function findItem(
	groups: Record<IssueState, LaunchQueueItem[]>,
	identifier: string
): LaunchQueueItem | undefined {
	for (const state of ISSUE_STATE_ORDER) {
		const hit = groups[state].find((it) => launchQueueItemIdentifier(it) === identifier)
		if (hit) return hit
	}
	return undefined
}
