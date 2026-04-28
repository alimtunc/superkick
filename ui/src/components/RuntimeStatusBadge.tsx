import type { RuntimeStatus } from '@/types'

const styles: Record<RuntimeStatus, string> = {
	online: 'bg-emerald-500/15 text-emerald-300',
	offline: 'bg-dim/30 text-dim',
	degraded: 'bg-gold-dim text-gold'
}

interface RuntimeStatusBadgeProps {
	status: RuntimeStatus
}

export function RuntimeStatusBadge({ status }: RuntimeStatusBadgeProps) {
	return (
		<span
			className={`font-data inline-block rounded px-2 py-0.5 text-[10px] font-medium tracking-wider uppercase ${styles[status]}`}
		>
			{status}
		</span>
	)
}
