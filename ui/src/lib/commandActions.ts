import type { JumpTarget, QuickAction } from '@/types'

export const QUICK_ACTIONS: QuickAction[] = [
	{
		id: 'launch-task-empty',
		kind: 'launch-task',
		label: 'Launch task…',
		hint: 'opens composer at /tasks/new',
		icon: 'zap',
		target: '/tasks/new',
		kbdHints: ['⌘', '↵']
	},
	{
		id: 'new-issue',
		kind: 'new-issue',
		label: 'New issue…',
		hint: 'in current repo',
		icon: 'plus',
		target: '/issues',
		kbdHints: ['c']
	},
	{
		id: 'switch-view',
		kind: 'switch-view',
		label: 'Switch view…',
		hint: 'My open work · All open · Recently shipped',
		icon: 'filter'
	},
	{
		id: 'switch-repo',
		kind: 'switch-repo',
		label: 'Switch repo…',
		icon: 'folder',
		kbdHints: ['⌘', 'R']
	},
	{
		id: 'open-inbox',
		kind: 'open-inbox',
		label: 'Open inbox',
		icon: 'inbox',
		target: '/'
	}
]

export const JUMP_TO_TARGETS: Omit<JumpTarget, 'badge'>[] = [
	{ id: 'jump-inbox', label: 'Inbox', icon: 'inbox', target: '/' },
	{ id: 'jump-issues', label: 'Issues', icon: 'issue', target: '/issues' },
	{ id: 'jump-tasks', label: 'Tasks', icon: 'task', target: '/queue' },
	{ id: 'jump-runs', label: 'Runs', icon: 'loop', target: '/runs' },
	{ id: 'jump-agents', label: 'Agents', icon: 'agent', target: '/agents' }
]
