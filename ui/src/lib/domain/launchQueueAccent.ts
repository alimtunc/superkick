import type { LaunchQueue } from '@/types'
import type { DotTone } from '@/ui/Dot'

interface LaunchQueueAccent {
	tone: DotTone
	label: string
	description: string
}

export const launchQueueAccent: Record<LaunchQueue, LaunchQueueAccent> = {
	backlog: {
		tone: 'neutral',
		label: 'Backlog',
		description: 'Not yet picked up in Linear.'
	},
	todo: {
		tone: 'neutral',
		label: 'Todo',
		description: 'Linear Todo — one click from triggered.'
	},
	launchable: {
		tone: 'live',
		label: 'Launchable',
		description: 'Ready to dispatch.'
	},
	waiting: {
		tone: 'warn',
		label: 'Waiting',
		description: 'Held by capacity or approval gate.'
	},
	blocked: {
		tone: 'danger',
		label: 'Blocked',
		description: 'Waiting on a Linear blocker.'
	},
	active: {
		tone: 'info',
		label: 'Active',
		description: 'Run in flight.'
	},
	'needs-human': {
		tone: 'warn',
		label: 'Needs human',
		description: 'Attention, interrupt, or failure.'
	},
	'in-pr': {
		tone: 'accent',
		label: 'In PR',
		description: 'Pull request open or draft.'
	},
	done: {
		tone: 'success',
		label: 'Done',
		description: 'Recently shipped runs.'
	}
}
