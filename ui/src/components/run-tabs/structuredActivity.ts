import type { RunEvent } from '@/types'

export type ActivityKind = 'diff' | 'progress' | 'search' | 'spec' | 'summary' | 'test' | 'write'

export interface ActivityPayload {
	activity_kind?: ActivityKind
	badge?: string
	changed?: { added?: number; removed?: number }
	command?: string
	detail?: string
	file?: string
	snippet?: string[]
	status?: 'fail' | 'green' | 'running'
	tests?: { name: string; result: 'fail' | 'pass' }[]
}

export function activityPayload(event: RunEvent): ActivityPayload | null {
	const payload = event.payload_json
	if (!payload || typeof payload !== 'object') return null
	const candidate = payload as ActivityPayload
	return candidate.activity_kind ? candidate : null
}

export function hasStructuredActivity(events: readonly RunEvent[]): boolean {
	return events.some((event) => activityPayload(event) !== null)
}
