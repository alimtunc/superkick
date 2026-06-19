import { ProviderStatusBadge } from '@/components/app/badges'
import { CapabilityList } from '@/domains/settings/components/CapabilityList'
import type { RuntimeProvider } from '@/types'

interface ProviderRowProps {
	provider: RuntimeProvider
}

export function ProviderRow({ provider }: ProviderRowProps) {
	const isAvailable = provider.status === 'available'
	const showPath = isAvailable && provider.executable_path !== null
	return (
		<div className="flex flex-col gap-1.5 px-4 py-3">
			<div className="flex items-center gap-3">
				<span className="font-data text-[12px] font-medium text-fg uppercase">{provider.kind}</span>
				<ProviderStatusBadge status={provider.status} />
				{provider.version ? (
					<span className="font-data text-[10px] text-fg-muted">v{provider.version}</span>
				) : null}
				{showPath ? (
					<span
						className="font-data ml-auto truncate text-[10px] text-fg-dim"
						title={provider.executable_path ?? undefined}
					>
						{provider.executable_path}
					</span>
				) : null}
			</div>
			{isAvailable ? <CapabilityList capabilities={provider.capabilities} /> : null}
		</div>
	)
}
