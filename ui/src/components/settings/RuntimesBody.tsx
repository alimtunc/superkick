import { NoProvidersDetected } from '@/components/settings/NoProvidersDetected'
import { RuntimeCard } from '@/components/settings/RuntimeCard'
import type { RuntimeWithProviders } from '@/types'

interface RuntimesBodyProps {
	runtimes: RuntimeWithProviders[]
	isLoading: boolean
	error: string | null
}

export function RuntimesBody({ runtimes, isLoading, error }: RuntimesBodyProps) {
	if (isLoading) {
		return <p className="font-data text-[11px] text-dim">Loading runtimes…</p>
	}
	if (error !== null) {
		return <p className="font-data text-[11px] text-oxide">{error}</p>
	}
	if (runtimes.length === 0) {
		return (
			<p className="font-data text-[11px] text-dim">
				No runtimes registered yet. Click Refresh to detect local CLIs.
			</p>
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
