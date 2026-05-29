import type { ProviderStatus } from '@/types'

const styles: Record<ProviderStatus, string> = {
	available: 'bg-emerald-500/15 text-emerald-300',
	unavailable: 'bg-danger-soft text-danger',
	stale: 'bg-warn-soft text-warn'
}

interface ProviderStatusBadgeProps {
	status: ProviderStatus
}

export function ProviderStatusBadge({ status }: ProviderStatusBadgeProps) {
	return (
		<span
			className={`font-data inline-block rounded px-2 py-0.5 text-[10px] font-medium tracking-wider uppercase ${styles[status]}`}
		>
			{status}
		</span>
	)
}
