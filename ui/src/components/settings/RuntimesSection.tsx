import { RuntimesBody } from '@/components/settings/RuntimesBody'
import { Button } from '@/components/ui/button'
import { useRuntimes } from '@/hooks/useRuntimes'

export function RuntimesSection() {
	const { data, isLoading, error, refresh, isRefreshing, refreshError } = useRuntimes()
	const runtimes = data?.runtimes ?? []
	const hasRuntimes = runtimes.length > 0

	return (
		<section className="flex flex-col gap-4">
			<header className="flex items-center gap-3">
				<span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-edge-bright" />
				<h2 className="font-data text-[12px] tracking-[0.18em] text-fog uppercase">Runtimes</h2>
				<span className="font-data text-[10px] text-dim">
					{hasRuntimes ? `${runtimes.length}` : '—'}
				</span>
				<Button
					type="button"
					variant="outline"
					size="xs"
					className="ml-auto"
					onClick={() => refresh()}
					disabled={isRefreshing}
				>
					{isRefreshing ? 'Refreshing…' : 'Refresh'}
				</Button>
			</header>

			{refreshError !== null ? (
				<p className="font-data text-[11px] text-oxide">{refreshError}</p>
			) : null}

			<RuntimesBody runtimes={runtimes} isLoading={isLoading} error={error} />
		</section>
	)
}
