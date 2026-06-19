import { Btn } from '@/components/primitives'
import { RuntimesBody } from '@/domains/settings/components/RuntimesBody'
import { useRuntimes } from '@/hooks/useRuntimes'

export function SettingsPaneRuntimes() {
	const { data, isLoading, error, refresh, isRefreshing, refreshError } = useRuntimes()
	const runtimes = data?.runtimes ?? []

	return (
		<section>
			<div className="mb-7 flex items-start justify-between gap-4">
				<div>
					<h2 className="mb-1.5 text-[21px] font-semibold tracking-tight text-fg">Runtimes</h2>
					<p className="text-[13px] leading-[1.55] text-fg-muted">
						Local CLIs Superkick detected on PATH and the providers they expose.
					</p>
				</div>
				<Btn kind="ghost" size="sm" onClick={() => refresh()} disabled={isRefreshing}>
					{isRefreshing ? 'Refreshing…' : 'Refresh'}
				</Btn>
			</div>

			<div className="section-head mt-0">
				<span className="section-head__title">Detected runtimes</span>
				<span className="section-head__line" />
			</div>

			{refreshError !== null ? (
				<p className="mono mb-3 text-[11px] text-danger">{refreshError}</p>
			) : null}

			<RuntimesBody runtimes={runtimes} isLoading={isLoading} error={error} />
		</section>
	)
}
