import type { LaunchQueue } from '@/types'
import type { LucideIcon } from 'lucide-react'
import {
	AlertTriangle,
	CheckCircle2,
	Circle,
	CircleDashed,
	CircleSlash,
	Gauge,
	GitPullRequest,
	Play,
	Rocket
} from 'lucide-react'

interface LaunchQueueAccent {
	border: string
	text: string
	label: string
	icon: LucideIcon
	description: string
}

/**
 * Visual accent + short operator-facing description per launch-queue
 * column. Mirrors `queueAccent` for the SUP-58 dashboard — the two tables
 * deliberately live side-by-side because the buckets do not overlap 1:1
 * (launch queue adds `launchable`, `waiting-capacity`, `waiting-approval`;
 * ops queue's `waiting` folds into `active` here). Keeping the styles in
 * sync visually is a design choice, not a DRY shortcut.
 */
export const launchQueueAccent: Record<LaunchQueue, LaunchQueueAccent> = {
	backlog: {
		border: 'border-t-dim',
		text: 'text-ash',
		label: 'Backlog',
		icon: CircleDashed,
		description: 'Not yet picked up in Linear.'
	},
	todo: {
		border: 'border-t-ash',
		text: 'text-silver',
		label: 'Todo',
		icon: Circle,
		description: 'Linear Todo — one click from triggered.'
	},
	launchable: {
		border: 'border-t-neon-green',
		text: 'text-neon-green',
		label: 'Launchable',
		icon: Rocket,
		description: 'Ready to dispatch.'
	},
	waiting: {
		border: 'border-t-gold/60',
		text: 'text-gold/80',
		label: 'Waiting',
		icon: Gauge,
		description: 'Held by capacity or approval gate.'
	},
	blocked: {
		border: 'border-t-gold/60',
		text: 'text-gold/80',
		label: 'Blocked',
		icon: CircleSlash,
		description: 'Waiting on a Linear blocker.'
	},
	active: {
		border: 'border-t-cyan',
		text: 'text-cyan',
		label: 'Active',
		icon: Play,
		description: 'Run in flight.'
	},
	'needs-human': {
		border: 'border-t-oxide',
		text: 'text-oxide',
		label: 'Needs human',
		icon: AlertTriangle,
		description: 'Attention, interrupt, or failure.'
	},
	'in-pr': {
		border: 'border-t-violet',
		text: 'text-violet',
		label: 'In PR',
		icon: GitPullRequest,
		description: 'Pull request open or draft.'
	},
	done: {
		border: 'border-t-mineral',
		text: 'text-mineral',
		label: 'Done',
		icon: CheckCircle2,
		description: 'Recently shipped runs.'
	}
}
