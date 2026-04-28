import { RuntimeStatusBadge } from '@/components/RuntimeStatusBadge'
import { NoProvidersDetected } from '@/components/settings/NoProvidersDetected'
import { ProviderRow } from '@/components/settings/ProviderRow'
import { fmtRelativeTime } from '@/lib/domain'
import type { RuntimeWithProviders } from '@/types'

interface RuntimeCardProps {
	runtime: RuntimeWithProviders
}

export function RuntimeCard({ runtime }: RuntimeCardProps) {
	const platform = [runtime.platform, runtime.arch]
		.filter((segment): segment is string => segment !== null)
		.join(' / ')
	return (
		<article className="rounded-md border border-edge bg-slate-deep/30">
			<header className="flex flex-wrap items-center gap-3 border-b border-edge px-4 py-3">
				<span className="font-data text-[13px] font-medium tracking-wider text-fog uppercase">
					{runtime.name}
				</span>
				<RuntimeStatusBadge status={runtime.status} />
				{runtime.host_label ? (
					<span className="font-data text-[10px] text-silver">{runtime.host_label}</span>
				) : null}
				{platform ? <span className="font-data text-[10px] text-dim">{platform}</span> : null}
				{runtime.last_seen_at ? (
					<span className="font-data ml-auto text-[10px] text-dim">
						refreshed {fmtRelativeTime(runtime.last_seen_at)}
					</span>
				) : null}
			</header>
			{runtime.providers.length > 0 ? (
				<div className="divide-y divide-edge">
					{runtime.providers.map((provider) => (
						<ProviderRow key={provider.id} provider={provider} />
					))}
				</div>
			) : (
				<NoProvidersDetected variant="inline" />
			)}
		</article>
	)
}
