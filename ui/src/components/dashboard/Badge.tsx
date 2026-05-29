import { Pill, type PillTone } from '@/components/ui/pill'

interface BadgeProps {
	tone: PillTone
	label: string
	title: string
}

export function Badge({ tone, label, title }: BadgeProps) {
	return (
		<Pill tone={tone} size="xs" title={title} aria-label={title}>
			{label}
		</Pill>
	)
}
