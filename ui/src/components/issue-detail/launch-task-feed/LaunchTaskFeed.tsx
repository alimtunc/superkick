import { LaunchTaskFeedBody } from '@/components/launch/LaunchTaskFeedBody'
import { ErrorState } from '@/components/ui/state-error'
import { LoadingState } from '@/components/ui/state-loading'
import { useIssueLaunchTasks } from '@/hooks/useIssueLaunchTasks'

import { LaunchTaskEmptyState } from './LaunchTaskEmptyState'

interface LaunchTaskFeedProps {
	issueIdentifier: string
}

export function LaunchTaskFeed({ issueIdentifier }: LaunchTaskFeedProps) {
	const { view, loading, error } = useIssueLaunchTasks(issueIdentifier)

	if (loading && !view) {
		return <LoadingState rows={3} density="compact" />
	}

	if (error && !view) {
		return <ErrorState density="compact" title="Failed to load launch task" message={error} />
	}

	if (!view) {
		return <LaunchTaskEmptyState />
	}

	return <LaunchTaskFeedBody task={view.task} steps={view.steps} />
}
