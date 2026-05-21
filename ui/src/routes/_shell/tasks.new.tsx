import { LaunchComposer } from '@/components/launch/LaunchComposer'
import { issueDetailQuery } from '@/lib/queries'
import { usePageActions } from '@/shell/usePageActions'
import { useQuery } from '@tanstack/react-query'
import { createRoute } from '@tanstack/react-router'

import { Route as shellRoute } from './route'

interface TasksNewSearch {
	issue?: string
	prefill?: string
}

export const Route = createRoute({
	getParentRoute: () => shellRoute,
	path: '/tasks/new',
	validateSearch: (raw: Record<string, unknown>): TasksNewSearch => {
		const issue = typeof raw.issue === 'string' && raw.issue.length > 0 ? raw.issue : undefined
		const prefill = typeof raw.prefill === 'string' && raw.prefill.length > 0 ? raw.prefill : undefined
		return { issue, prefill }
	},
	component: TasksNewPage
})

function TasksNewPage() {
	const search = Route.useSearch()
	const issueIdentifier = search.issue ?? null
	const issueDetail = useQuery({
		...issueDetailQuery(issueIdentifier ?? ''),
		enabled: !!issueIdentifier
	})

	usePageActions({ title: 'What should we work on?' })

	return <LaunchComposer issue={issueDetail.data ?? null} prefill={search.prefill ?? null} />
}
