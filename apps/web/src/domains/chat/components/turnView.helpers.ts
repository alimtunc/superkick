import { type PillTone } from '@/components/primitives'
import type { Turn } from '@/types'

export interface UsageDisplay {
	label: string
	tooltip: string
}

export function formatUsage(turn: Turn): UsageDisplay | null {
	const u = turn.usage
	if (!u) return null
	const out = u.output_tokens ?? 0
	const inp = u.input_tokens ?? 0
	const cache = u.cache_read_tokens ?? 0
	if (out === 0 && inp === 0 && cache === 0) return null
	const tooltipParts: string[] = []
	if (inp > 0) tooltipParts.push(`input ${inp}`)
	if (out > 0) tooltipParts.push(`output ${out}`)
	if (cache > 0) tooltipParts.push(`cache ${cache}`)
	return {
		label: `${out} tokens`,
		tooltip: tooltipParts.join(' · ')
	}
}

export function statusTone(status: Turn['status']): PillTone {
	switch (status) {
		case 'completed':
			return 'success'
		case 'failed':
			return 'danger'
		case 'streaming':
			return 'info'
		case 'cancelled':
		default:
			return 'neutral'
	}
}
