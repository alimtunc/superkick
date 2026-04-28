import type { ProviderStatus } from '@/types'

const styles: Record<ProviderStatus, string> = {
	available: 'bg-emerald-500/15 text-emerald-300',
	unavailable: 'bg-oxide-dim text-oxide',
	stale: 'bg-gold-dim text-gold'
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
