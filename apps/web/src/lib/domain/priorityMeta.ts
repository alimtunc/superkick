import type { PriorityIconKind } from '@/types'

export const PRIORITY_META: Record<number, { label: string; color: string; kind: PriorityIconKind }> = {
	0: { label: 'None', color: '#6b7280', kind: 'none' },
	1: { label: 'Urgent', color: '#ef4444', kind: 'urgent' },
	2: { label: 'High', color: '#f97316', kind: 'high' },
	3: { label: 'Medium', color: '#3b82f6', kind: 'medium' },
	4: { label: 'Low', color: '#6b7280', kind: 'low' }
}

export function priorityIconKindFromValue(value: number): PriorityIconKind {
	return PRIORITY_META[value]?.kind ?? 'none'
}
