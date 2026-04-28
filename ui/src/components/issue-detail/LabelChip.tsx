import type { IssueLabel } from '@/types'

interface LabelChipProps {
	label: IssueLabel
}

export function LabelChip({ label }: LabelChipProps) {
	return (
		<span
			className="font-data inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]"
			style={{
				color: label.color,
				borderColor: `color-mix(in oklch, ${label.color} 25%, transparent)`
			}}
		>
			<span
				className="inline-block h-1.5 w-1.5 rounded-full"
				style={{ backgroundColor: label.color }}
			/>
			{label.name}
		</span>
	)
}
