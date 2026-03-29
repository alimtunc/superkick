export const PRIORITY_META: Record<number, { label: string; color: string }> = {
	0: { label: 'None', color: '#6b7280' },
	1: { label: 'Urgent', color: '#ef4444' },
	2: { label: 'High', color: '#f97316' },
	3: { label: 'Medium', color: '#3b82f6' },
	4: { label: 'Low', color: '#6b7280' }
}

export function priorityColor(value: number): string {
	return PRIORITY_META[value]?.color ?? '#6b7280'
}
