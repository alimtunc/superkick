import { Tooltip } from '@/components/ui/tooltip'

interface CapabilityBadgeProps {
	label: string
	title: string
	enabled: boolean
}

export function CapabilityBadge({ label, title, enabled }: CapabilityBadgeProps) {
	const tone = enabled
		? 'border-border-strong/40 bg-border/30 text-fg'
		: 'border-border/40 bg-transparent text-fg-dim'
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
