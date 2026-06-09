import { PhaseColumn } from '@/components/board/PhaseColumn'
import type { PhaseColumn as PhaseColumnData } from '@/types'

interface PhaseBoardProps {
	columns: PhaseColumnData[]
	refTime: number
}

export function PhaseBoard({ columns, refTime }: PhaseBoardProps) {
	return (
		<div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-1">
			{columns.map((column) => (
				<PhaseColumn key={column.phase} column={column} refTime={refTime} />
			))}
		</div>
	)
}
