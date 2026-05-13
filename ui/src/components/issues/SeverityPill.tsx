import { Pill, type PillTone } from '@/components/ui/pill'

interface SeverityPillProps {
	value: number
	className?: string
}

const SEV_LABEL: Record<number, string> = {
	0: '—',
	1: 'P1',
	2: 'P2',
	3: 'P3',
	4: 'P4'
}

const SEV_TONE: Record<number, PillTone> = {
	0: 'neutral',
	1: 'danger',
	2: 'warn',
	3: 'info',
	4: 'neutral'
}

const SEV_TITLE: Record<number, string> = {
	0: 'No priority',
	1: 'Urgent',
	2: 'High',
	3: 'Medium',
	4: 'Low'
}

export function SeverityPill({ value, className }: SeverityPillProps) {
	const label = SEV_LABEL[value] ?? '—'
	const tone = SEV_TONE[value] ?? 'neutral'
	const title = SEV_TITLE[value] ?? 'Unknown'

	return (
		<Pill tone={tone} size="xs" mono title={title} className={`w-8 justify-center ${className ?? ''}`}>
			{label}
		</Pill>
	)
}
