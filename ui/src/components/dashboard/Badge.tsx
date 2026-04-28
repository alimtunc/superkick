import { Pill, type PillTone } from '@/components/ui/pill'

export type BadgeTone = 'oxide' | 'gold' | 'violet'

const toneMap: Record<BadgeTone, PillTone> = {
	oxide: 'oxide',
	gold: 'gold',
	violet: 'violet'
}

interface BadgeProps {
	tone: BadgeTone
	label: string
	title: string
}

export function Badge({ tone, label, title }: BadgeProps) {
	return (
		<Pill tone={toneMap[tone]} size="xs" title={title} aria-label={title}>
			{label}
		</Pill>
	)
}
