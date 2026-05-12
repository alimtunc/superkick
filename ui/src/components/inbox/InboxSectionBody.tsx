import type { ReactNode } from 'react'

import { EmptyState } from '@/components/ui/state-empty'
import { ErrorState } from '@/components/ui/state-error'
import { LoadingState } from '@/components/ui/state-loading'

interface InboxSectionBodyProps {
	loading: boolean
	error: string | null
	emptyMessage: string
	isEmpty: boolean
	skeletonRows?: number
	onRetry?: () => void
	/** Optional banner rendered above both the empty state and the children list. */
	prepend?: ReactNode
	children: ReactNode
}

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
	if (loading) {
		return (
			<div className="px-6 py-2">
				<LoadingState rows={skeletonRows} density="compact" />
			</div>
		)
	}
	if (error) {
		return (
			<div className="px-6 py-2">
				<ErrorState message={error} onRetry={onRetry} density="compact" />
			</div>
		)
	}
	if (isEmpty) {
		return (
			<div className="flex flex-col gap-2 px-6 py-2">
				{prepend}
				<EmptyState title={emptyMessage} density="compact" />
			</div>
		)
	}
	return (
		<div className="flex flex-col">
			{prepend ? <div className="px-6 pt-2">{prepend}</div> : null}
			{children}
		</div>
	)
}
