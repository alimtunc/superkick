export type BadgeTone = 'oxide' | 'gold' | 'violet'

const toneClass: Record<BadgeTone, string> = {
	oxide: 'bg-oxide-dim text-oxide',
	gold: 'bg-gold-dim text-gold',
	violet: 'bg-violet-dim text-violet'
}

interface BadgeProps {
	tone: BadgeTone
	label: string
	title: string
}

export function Badge({ tone, label, title }: BadgeProps) {
	return (
		<span
			title={title}
			aria-label={title}
			className={`font-data rounded px-1.5 py-px text-[9px] leading-tight tracking-wider ${toneClass[tone]}`}
		>
			{label}
		</span>
	)
}
