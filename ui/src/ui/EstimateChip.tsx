import { cn } from '@/lib/utils'

interface EstimateChipProps {
	n: number
	className?: string
}

export function EstimateChip({ n, className }: EstimateChipProps) {
	return (
		<span
			className={cn(
				'font-data inline-flex h-[18px] w-[22px] items-center justify-center rounded border border-border text-[11px] font-medium text-fg-muted',
				className
			)}
		>
			{n}
		</span>
	)
}
