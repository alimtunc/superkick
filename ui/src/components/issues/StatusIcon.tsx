import type { LinearStateType } from '@/types'
import { Circle, CircleCheck, CircleDashed, CircleDot, CircleX } from 'lucide-react'

export function StatusIcon({ stateType, color }: { stateType: LinearStateType; color: string }) {
	const props = { size: 14, strokeWidth: 1.75, color, 'aria-hidden': true }

	switch (stateType) {
		case 'backlog':
			return <CircleDashed {...props} opacity={0.6} />
		case 'unstarted':
			return <Circle {...props} />
		case 'started':
			return <CircleDot {...props} />
		case 'completed':
			return <CircleCheck {...props} />
		case 'canceled':
			return <CircleX {...props} />
	}
}
