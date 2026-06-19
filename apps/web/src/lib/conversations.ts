import type { ConversationSubject } from '@/types'

/**
 * Stable string key for a chat subject. Used as the React Query cache key
 * suffix and as the localStorage namespace for the persisted "selected
 * conversation" pointer.
 */
export function subjectKey(subject: ConversationSubject): string {
	if (subject.kind === 'issue') return `issue:${subject.identifier}`
	return `run:${subject.run_id}`
}
