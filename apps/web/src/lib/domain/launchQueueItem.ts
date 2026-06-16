import type { LaunchQueueItem } from '@/types'

export function launchQueueItemIdentifier(item: LaunchQueueItem): string | undefined {
	if (item.kind === 'issue') return item.issue.identifier
	return item.linked_issue?.identifier
}
