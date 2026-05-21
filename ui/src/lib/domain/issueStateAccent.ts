import type { IssueState } from '@/types'
import type { SKTone } from '@/types/icons'

interface IssueStateAccent {
	label: string
	description: string
}

export const issueStateTone: Record<IssueState, SKTone> = {
	open: 'neutral',
	in_progress: 'info',
	needs_human: 'warn',
	in_review: 'accent',
	done: 'success'
}

export const issueStateAccent: Record<IssueState, IssueStateAccent> = {
	open: { label: 'Open', description: 'Ready to start — Linear Backlog or Todo.' },
	in_progress: { label: 'In Progress', description: 'Run in flight.' },
	needs_human: { label: 'Needs Human', description: 'Attention, interrupt, or failure.' },
	in_review: { label: 'In Review', description: 'Pull request open or draft.' },
	done: { label: 'Done', description: 'Recently shipped.' }
}
