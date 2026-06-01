import { JUMP_TO_TARGETS, QUICK_ACTIONS } from '@/lib/commandActions'
import type { Run } from '@/types'
import type { EmptyRow } from '@/types/command'

export function buildEmptyRows(needsYou: Run[]): EmptyRow[] {
	const rows: EmptyRow[] = needsYou
		.slice(0, 2)
		.map((r) => ({ id: `needs:${r.id}`, target: `/runs/${r.id}` }))
	for (const action of QUICK_ACTIONS) {
		rows.push({ id: action.id, target: action.target ?? '' })
	}
	for (const jump of JUMP_TO_TARGETS) {
		rows.push({ id: jump.id, target: jump.target })
	}
	return rows
}
