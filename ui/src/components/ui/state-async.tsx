import type { ReactNode } from 'react'

import { EmptyState } from '@/components/ui/state-empty'
import { ErrorState } from '@/components/ui/state-error'
import { LoadingState } from '@/components/ui/state-loading'

interface AsyncSectionProps {
	isLoading: boolean
	error: string | null
	isEmpty: boolean
	emptyTitle: string
	emptyDescription?: string
	density?: 'compact' | 'default'
	children: ReactNode
}

export function AsyncSection({
	isLoading,
	error,
	isEmpty,
	emptyTitle,
	emptyDescription,
	density = 'compact',
	children
}: AsyncSectionProps) {
	if (isLoading) {
		return <LoadingState density={density} />
	}
	if (error !== null) {
		return <ErrorState message={error} density={density} />
	}
	if (isEmpty) {
		return <EmptyState density={density} title={emptyTitle} description={emptyDescription} />
	}
	return <>{children}</>
}
