import type { IssueState } from '@/types'
import type { SKTone } from '@/types/icons'

interface IssueStateAccent {
	label: string
	description: string
}

export const issueStateTone: Record<IssueState, SKTone> = {
	needs_human: 'warn',
	backlog: 'neutral',
	todo: 'neutral',
	in_progress: 'info',
	in_review: 'accent',
	done: 'success'
}

export const issueStateAccent: Record<IssueState, IssueStateAccent> = {
	needs_human: { label: 'Needs you', description: 'Attention, interrupt, or failure.' },
	backlog: { label: 'Backlog', description: 'Not yet scheduled — Linear Backlog.' },
	todo: { label: 'Todo', description: 'Ready to start — Linear Todo.' },
	in_progress: { label: 'In Progress', description: 'Run in flight.' },
	in_review: { label: 'In Review', description: 'Pull request open or draft.' },
	done: { label: 'Done', description: 'Recently shipped.' }
}
