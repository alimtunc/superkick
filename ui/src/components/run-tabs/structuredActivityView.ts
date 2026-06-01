import type { ActivityPayload } from '@/components/run-tabs/structuredActivity'
import type { RunEvent } from '@/types'
import type { SKIconName } from '@/types/icons'

export function nodeToneClass(event: RunEvent, payload: ActivityPayload): string {
	if (event.level === 'error' || payload.status === 'fail') return 'warn'
	if (payload.status === 'green') return 'success'
	if (payload.status === 'running') return 'accent'
	return ''
}

export function iconFor(payload: ActivityPayload): SKIconName {
	switch (payload.activity_kind) {
		case 'diff':
		case 'write':
			return 'doc'
		case 'search':
			return 'search'
		case 'summary':
			return 'check'
		case 'test':
			return 'check'
		default:
			return 'spark'
	}
}

export function diffLineClass(line: string): string {
	if (line.startsWith('+')) return 'c-success'
	if (line.startsWith('-')) return 'c-danger'
	return 'c-fg'
}
