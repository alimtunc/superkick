import { Tooltip } from '@/components/ui/tooltip'

interface CapabilityBadgeProps {
	label: string
	title: string
	enabled: boolean
}

export function CapabilityBadge({ label, title, enabled }: CapabilityBadgeProps) {
	const tone = enabled
		? 'border-edge-bright/40 bg-edge/30 text-fog'
		: 'border-edge/40 bg-transparent text-dim'
	const fullLabel = enabled ? title : `${title} (not supported)`
	return (
		<Tooltip label={fullLabel}>
			<span
				className={`font-data inline-flex h-5 items-center rounded border px-1.5 text-[9px] tracking-wider uppercase ${tone}`}
			>
				{label}
			</span>
		</Tooltip>
	)
}
