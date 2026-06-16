import type { ActivityPayload } from '@/domains/runs/components/run-tabs/structuredActivity'

export function ActivityDelta({ changed }: { changed?: ActivityPayload['changed'] }) {
	if (!changed) return null
	const added = changed.added ?? 0
	const removed = changed.removed ?? 0
	return (
		<span className="filerow__stat ml-auto shrink-0">
			<span className="add">+{added}</span>
			<span className="del">−{removed}</span>
		</span>
	)
}
