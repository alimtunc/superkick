import type { IssueLabel } from '@/types'

interface LabelChipProps {
	label: IssueLabel
	truncate?: boolean
}

export function LabelChip({ label, truncate = false }: LabelChipProps) {
	return (
		<span className="label-chip">
			<span className="dot" style={{ backgroundColor: label.color }} aria-hidden="true" />
			{truncate ? <span className="max-w-20 truncate">{label.name}</span> : label.name}
		</span>
	)
}
