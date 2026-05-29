import { InterventionRow } from '@/components/launch/InterventionRow'
import type { LaunchTaskIntervention } from '@/types'

interface InterventionListProps {
	label: string
	rows: LaunchTaskIntervention[]
	variant: 'above' | 'below'
}

export function InterventionList({ label, rows, variant }: InterventionListProps) {
	if (rows.length === 0) return null
	const spacing = variant === 'above' ? 'mb-4' : 'mt-4'
	return (
		<div className={spacing}>
			<div className="font-data mb-2 text-[11px] tracking-wide text-fg-dim uppercase">{label}</div>
			{rows.map((i) => (
				<InterventionRow key={i.id} intervention={i} />
			))}
		</div>
	)
}
