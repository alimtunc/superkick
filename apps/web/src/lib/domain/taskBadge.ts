import type { LaunchQueueItem, TaskBadgeKind } from '@/types'

/** In-flight `TaskBadge` kind for a launch-queue item, or `null` when the row has no active task. */
export function taskBadgeFor(item: LaunchQueueItem): TaskBadgeKind | null {
	switch (item.bucket) {
		case 'needs-human':
			return 'needs'
		case 'active':
			return 'running'
		case 'in-pr':
			return 'review'
		case 'done':
			return 'shipped'
		default:
			return null
	}
}
