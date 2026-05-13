import type { LaunchTaskEvent, SseHandlers, WorkspaceRunEvent } from '@/types'

import { subscribeToSse } from './_shared'

export function subscribeToWorkspaceEvents(handlers: SseHandlers<WorkspaceRunEvent>): () => void {
	return subscribeToSse('/events', 'workspace_event', handlers)
}

export function subscribeToLaunchTaskEvents(handlers: SseHandlers<LaunchTaskEvent>): () => void {
	return subscribeToSse('/launch-tasks/events', 'launch_task_event', handlers)
}
