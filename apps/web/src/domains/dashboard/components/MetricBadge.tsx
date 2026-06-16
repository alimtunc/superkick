import { Pill, type PillTone } from '@/components/primitives'
interface MetricBadgeProps {
	tone: PillTone
	label: string
	title: string
}

export function MetricBadge({ tone, label, title }: MetricBadgeProps) {
	return (
		<Pill tone={tone} size="xs" title={title} aria-label={title}>
			{label}
		</Pill>
	)
}
