import type { IssueLinkedItemRef } from '@/types'

export type LinkedItemHrefTarget =
	| { to: '/runs/$runId'; params: { runId: string } }
	| { to: '/tasks/$taskId'; params: { taskId: string } }

export function linkedItemHref(ref: IssueLinkedItemRef): LinkedItemHrefTarget | null {
	switch (ref.kind) {
		case 'run':
			return { to: '/runs/$runId', params: { runId: ref.id } }
		case 'launch_task':
			return { to: '/tasks/$taskId', params: { taskId: ref.id } }
		case 'conversation':
			return null
		default: {
			const _exhaustive: never = ref.kind
			return _exhaustive
		}
	}
}
