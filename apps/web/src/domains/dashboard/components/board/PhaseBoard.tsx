import { KanbanColumn } from '@/domains/issues/components/KanbanColumn'
import { boardCardToLaunchRunItem, PHASE_TO_STATUS_KIND } from '@/lib/board/boardCardAdapter'
import type { PhaseColumn as PhaseColumnData, RecentUnblocks } from '@/types'

interface PhaseBoardProps {
	columns: PhaseColumnData[]
	refTime: number
}

const NO_UNBLOCKS: RecentUnblocks = {}

function noopDispatch() {}

export function PhaseBoard({ columns, refTime }: PhaseBoardProps) {
	return (
		<div className="board min-h-0 flex-1">
			{columns.map((column) => (
				<KanbanColumn
					key={column.phase}
					state="todo"
					items={column.cards.map(boardCardToLaunchRunItem)}
					refTime={refTime}
					onDispatch={noopDispatch}
					dispatchPending={false}
					recentUnblocks={NO_UNBLOCKS}
					activeDragId={null}
					enableDnd={false}
					label={column.label}
					statusKind={PHASE_TO_STATUS_KIND[column.phase]}
					forceRunCards
				/>
			))}
		</div>
	)
}
