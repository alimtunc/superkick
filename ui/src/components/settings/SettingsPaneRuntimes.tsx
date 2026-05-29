import { RuntimesBody } from '@/components/settings/RuntimesBody'
import { useRuntimes } from '@/hooks/useRuntimes'
import { Btn } from '@/ui/Btn'

export function SettingsPaneRuntimes() {
	const { data, isLoading, error, refresh, isRefreshing, refreshError } = useRuntimes()
	const runtimes = data?.runtimes ?? []

	return (
		<section>
			<div className="mb-[22px] flex items-start justify-between gap-4">
				<div>
					<h2 className="mb-1.5 text-[18px] font-semibold text-fg">Runtimes</h2>
					<p className="text-[13px] leading-[1.55] text-fg-muted">
						Local CLIs Superkick detected on PATH and the providers they expose.
					</p>
				</div>
				<Btn kind="ghost" size="sm" onClick={() => refresh()} disabled={isRefreshing}>
					{isRefreshing ? 'Refreshing…' : 'Refresh'}
				</Btn>
			</div>

			{refreshError !== null ? (
				<p className="font-data mb-3 text-[11px] text-danger">{refreshError}</p>
			) : null}

			<RuntimesBody runtimes={runtimes} isLoading={isLoading} error={error} />
		</section>
	)
}
