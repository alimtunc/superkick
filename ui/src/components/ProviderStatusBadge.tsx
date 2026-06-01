import { Pill, type PillTone } from '@/components/ui/pill'
import type { ProviderStatus } from '@/types'

const tones: Record<ProviderStatus, PillTone> = {
	available: 'success',
	unavailable: 'danger',
	stale: 'warn'
}

interface ProviderStatusBadgeProps {
	status: ProviderStatus
}

export function ProviderStatusBadge({ status }: ProviderStatusBadgeProps) {
	return (
		<Pill
			tone={tones[status]}
			size="xs"
			className="font-data h-auto rounded px-2 py-0.5 text-[10px] tracking-wider uppercase"
		>
			{status}
		</Pill>
	)
}
