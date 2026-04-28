import type { IssueState } from '@/types'
import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, CheckCircle2, Circle, CircleDashed, GitPullRequest, Play } from 'lucide-react'

interface IssueStateAccent {
	border: string
	text: string
	dot: string
	label: string
	icon: LucideIcon
	description: string
}

/**
 * Visual accent + short copy per operator-facing state. Aligned with
 * `launchQueueAccent` so the kanban-to-list visual language stays
 * consistent, but kept as a separate table because the reduction
 * deliberately drops three columns (`launchable` / `waiting` / `blocked`)
 * and relabels `in-pr` as "In review".
 */
export const issueStateAccent: Record<IssueState, IssueStateAccent> = {
	backlog: {
		border: 'border-t-dim',
		text: 'text-ash',
		dot: 'bg-ash',
		label: 'Backlog',
		icon: CircleDashed,
		description: 'Not yet picked up.'
	},
	todo: {
		border: 'border-t-ash',
		text: 'text-silver',
		dot: 'bg-silver',
		label: 'Todo',
		icon: Circle,
		description: 'Linear Todo — ready to be triggered.'
	},
	in_progress: {
		border: 'border-t-cyan',
		text: 'text-cyan',
		dot: 'bg-cyan',
		label: 'In Progress',
		icon: Play,
		description: 'Run in flight.'
	},
	needs_human: {
		border: 'border-t-oxide',
		text: 'text-oxide',
		dot: 'bg-oxide',
		label: 'Needs Human',
		icon: AlertTriangle,
		description: 'Attention, interrupt, or failure.'
	},
	in_review: {
		border: 'border-t-violet',
		text: 'text-violet',
		dot: 'bg-violet',
		label: 'In Review',
		icon: GitPullRequest,
		description: 'Pull request open or draft.'
	},
	done: {
		border: 'border-t-mineral',
		text: 'text-mineral',
		dot: 'bg-mineral',
		label: 'Done',
		icon: CheckCircle2,
		description: 'Recently shipped.'
	}
}
