import type { ReactNode } from 'react'

import { InboxEmptyState } from '@/components/inbox/InboxEmptyState'
import { InboxSectionError } from '@/components/inbox/InboxSectionError'
import { InboxSectionSkeleton } from '@/components/inbox/InboxSectionSkeleton'

interface InboxSectionBodyProps {
	loading: boolean
	error: string | null
	emptyMessage: string
	isEmpty: boolean
	skeletonRows?: number
	onRetry?: () => void
	/** Optional banner rendered above both the empty state and the children list. */
	prepend?: ReactNode
	/** Rendered when not loading, not errored, and not empty. */
	children: ReactNode
}

/**
 * Single source of truth for an Inbox section's body state machine:
 * loading → skeleton, error → error panel, empty → dashed empty state,
 * else → children. The `prepend` slot lets sections layer a banner (e.g.
 * a Linear-down warning) above the empty state without re-implementing the
 * branching.
 */
export function InboxSectionBody({
	loading,
	error,
	emptyMessage,
	isEmpty,
	skeletonRows = 2,
	onRetry,
	prepend,
	children
}: InboxSectionBodyProps) {
	if (loading) return <InboxSectionSkeleton rows={skeletonRows} />
	if (error) return <InboxSectionError message={error} onRetry={onRetry} />
	if (isEmpty) {
		return (
			<div className="flex flex-col gap-2">
				{prepend ? prepend : null}
				<InboxEmptyState message={emptyMessage} />
			</div>
		)
	}
	return (
		<div className="flex flex-col gap-2">
			{prepend ? prepend : null}
			{children}
		</div>
	)
}
