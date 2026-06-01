import { NoProvidersDetected } from '@/components/settings/NoProvidersDetected'
import { RuntimeCard } from '@/components/settings/RuntimeCard'
import { EmptyState } from '@/components/ui/state-empty'
import { ErrorState } from '@/components/ui/state-error'
import { LoadingState } from '@/components/ui/state-loading'
import type { RuntimeWithProviders } from '@/types'

interface RuntimesBodyProps {
	runtimes: RuntimeWithProviders[]
	isLoading: boolean
	error: string | null
}

export function RuntimesBody({ runtimes, isLoading, error }: RuntimesBodyProps) {
	if (isLoading) {
		return <LoadingState density="compact" />
	}
	if (error !== null) {
		return <ErrorState message={error} density="compact" />
	}
	if (runtimes.length === 0) {
		return (
			<EmptyState
				density="compact"
				title="No runtimes registered yet"
				description="Click Refresh to detect local CLIs."
			/>
		)
	}
	const hasAnyProvider = runtimes.some((runtime) => runtime.providers.length > 0)
	if (!hasAnyProvider) {
		return <NoProvidersDetected />
	}
	return (
		<div className="flex flex-col gap-3">
			{runtimes.map((runtime) => (
				<RuntimeCard key={runtime.id} runtime={runtime} />
			))}
		</div>
	)
}
