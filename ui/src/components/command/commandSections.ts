export const SECTION_LIMIT = 5

export function isDone(stateType: string): boolean {
	return stateType === 'completed' || stateType === 'canceled'
}
