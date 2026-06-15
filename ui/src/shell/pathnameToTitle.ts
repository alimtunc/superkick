import type { ShellTitle } from '@/types'

const HOME: ShellTitle = { active: 'inbox', title: 'Inbox' }

const ROOT_TITLES: Partial<Record<string, ShellTitle>> = {
	'/': HOME,
	'/board': { active: 'board', title: 'Board' },
	'/reviews': { active: 'reviews', title: 'Reviews' },
	'/issues': { active: 'issues', title: 'Issues' },
	'/queue': { active: null, title: 'Launch queue' },
	'/tasks': { active: null, title: 'Tasks' },
	'/runs': { active: null, title: 'Runs' },
	'/agents': { active: 'agents', title: 'Agents' },
	'/skills': { active: 'skills', title: 'Skills' }
}

function humanizeSegment(segment: string): string {
	if (segment.length === 0) return ''
	return segment.charAt(0).toUpperCase() + segment.slice(1)
}

export function pathnameToTitle(pathname: string): ShellTitle {
	const direct = ROOT_TITLES[pathname]
	if (direct) return direct

	const segments = pathname.split('/').filter(Boolean)
	if (segments.length === 0) return HOME

	const rootKey = `/${segments[0]}`
	const root = ROOT_TITLES[rootKey]
	if (!root) {
		return { active: null, title: humanizeSegment(segments[0]) }
	}

	const detail = segments.slice(1).map(humanizeSegment)
	if (detail.length === 0) return root
	return {
		active: root.active,
		title: detail[detail.length - 1],
		crumbs: [root.title, ...detail.slice(0, -1)]
	}
}
