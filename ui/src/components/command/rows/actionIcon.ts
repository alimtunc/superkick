import type { SearchActionKind, SKIconName } from '@/types'

const ICON_FOR_KIND: Record<SearchActionKind, SKIconName> = {
	'launch-task': 'zap',
	'new-issue': 'plus',
	'switch-view': 'filter',
	'switch-repo': 'folder',
	'open-inbox': 'inbox',
	'jump-to-issues': 'issue',
	'jump-to-tasks': 'task',
	'jump-to-runs': 'loop',
	'jump-to-agents': 'agent'
}

export function iconForActionKind(kind: SearchActionKind): SKIconName {
	return ICON_FOR_KIND[kind] ?? 'cmd'
}
