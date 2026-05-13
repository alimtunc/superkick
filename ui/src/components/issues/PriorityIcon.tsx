import { priorityColor } from '@/lib/domain/priorityMeta'
import { ChevronsUp, ChevronUp, CircleMinus, Minus, TriangleAlert } from 'lucide-react'

export function PriorityIcon({ value }: { value: number }) {
	const color = priorityColor(value)
	const props = { size: 14, strokeWidth: 1.75, color, 'aria-hidden': true }

	if (value === 1) {
		return <TriangleAlert {...props} fill={`${color}25`} />
	}
	if (value === 2) {
		return <ChevronsUp {...props} />
	}
	if (value === 3) {
		return <ChevronUp {...props} />
	}
	if (value === 4) {
		return <Minus {...props} />
	}

	return <CircleMinus {...props} />
}
