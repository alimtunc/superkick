import type { ReactNode } from 'react'

import { SectionHeading } from '@/components/ui/section-heading'
import { EmptyState } from '@/components/ui/state-empty'
import { ErrorState } from '@/components/ui/state-error'
import { LoadingState } from '@/components/ui/state-loading'
import type { LucideIcon } from 'lucide-react'

interface ContextSectionProps {
	ariaLabel: string
	heading: string
	isLoading: boolean
	error: unknown
	errorTitle: string
	errorFallback: string
	onRetry: () => void
	isEmpty: boolean
	emptyIcon: LucideIcon
	emptyTitle: string
	emptyDescription: string
	loadingRows?: number
	omitWhenEmpty?: boolean
	children: ReactNode
}

export function ContextSection({
	ariaLabel,
	heading,
	isLoading,
	error,
	errorTitle,
	errorFallback,
	onRetry,
	isEmpty,
	emptyIcon,
	emptyTitle,
	emptyDescription,
	loadingRows = 2,
	omitWhenEmpty = false,
	children
}: ContextSectionProps) {
	if (omitWhenEmpty && !isLoading && !error && isEmpty) return null

	let body: ReactNode

	if (isLoading) {
		body = <LoadingState rows={loadingRows} density="compact" />
	} else if (error) {
		body = (
			<ErrorState
				density="compact"
				title={errorTitle}
				message={String(error) || errorFallback}
				onRetry={onRetry}
			/>
		)
	} else if (isEmpty) {
		body = (
			<EmptyState
				density="compact"
				icon={emptyIcon}
				title={emptyTitle}
				description={emptyDescription}
			/>
		)
	} else {
		body = children
	}

	return (
		<section aria-label={ariaLabel}>
			<SectionHeading>{heading}</SectionHeading>
			{body}
		</section>
	)
}
