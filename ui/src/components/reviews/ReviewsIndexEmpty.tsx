import { EmptyState } from '@/components/ui/state-empty'
import { GitPullRequest } from 'lucide-react'

export function ReviewsIndexEmpty() {
	return (
		<div className="flex h-full items-center justify-center p-6">
			<EmptyState
				icon={GitPullRequest}
				title="Select a pull request"
				description="Pick a PR from the list to see its activity, reviewers, and diff."
				density="compact"
			/>
		</div>
	)
}
