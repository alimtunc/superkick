import { IssueDetail } from '@/components/issue-detail/IssueDetail'
import { issueDetailQuery } from '@/lib/queries'
import { createRoute, useParams } from '@tanstack/react-router'

import { Route as shellRoute } from './route'

export const Route = createRoute({
	getParentRoute: () => shellRoute,
	path: '/issues/$issueId',
	loader: ({ context, params }) => context.queryClient.ensureQueryData(issueDetailQuery(params.issueId)),
	component: IssueDetailPage
})

function IssueDetailPage() {
	const { issueId } = useParams({ from: '/_shell/issues/$issueId' })
	return <IssueDetail issueId={issueId} />
}
