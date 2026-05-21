import type { IssueLabel } from '@/types'

interface LabelChipProps {
	label: IssueLabel
}

export function LabelChip({ label }: LabelChipProps) {
	return (
		<span className="font-data inline-flex h-4.5 shrink-0 items-center gap-1.5 rounded-full border border-border px-1.5 text-[11px] leading-none whitespace-nowrap text-fg-muted">
			<span
				className="inline-block size-1.5 rounded-full"
				style={{ backgroundColor: label.color }}
				aria-hidden="true"
			/>
			{label.name}
		</span>
	)
}
