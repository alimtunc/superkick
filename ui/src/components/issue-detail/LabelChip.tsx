import type { IssueLabel } from '@/types'

interface LabelChipProps {
	label: IssueLabel
}

export function LabelChip({ label }: LabelChipProps) {
	return (
		<span
			className="font-data inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full border px-2 text-[11px] leading-none whitespace-nowrap"
			style={{
				color: label.color,
				borderColor: `color-mix(in oklch, ${label.color} 25%, transparent)`,
				backgroundColor: `color-mix(in oklch, ${label.color} 6%, transparent)`
			}}
		>
			<span
				className="inline-block h-1.5 w-1.5 rounded-full"
				style={{ backgroundColor: label.color }}
				aria-hidden="true"
			/>
			{label.name}
		</span>
	)
}
