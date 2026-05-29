import { cn } from '@/lib/utils'

interface SubCountChipProps {
	done: number
	total: number
	className?: string
}

export function SubCountChip({ done, total, className }: SubCountChipProps) {
	return (
		<span
			className={cn('inline-flex items-center gap-1', className)}
			title={`${done} of ${total} sub-issues done`}
		>
			<svg
				width={11}
				height={11}
				viewBox="0 0 14 14"
				fill="none"
				stroke="currentColor"
				strokeWidth={1.3}
				strokeLinecap="round"
				strokeLinejoin="round"
				className="text-fg-dim"
				aria-hidden="true"
			>
				<path d="M3 11 L3 4 L7 4 M3 7 L7 7 M7 4 L7 11 L11 11" />
			</svg>
			<span className="font-data text-[11.5px] text-fg-muted">
				{done}/{total}
			</span>
		</span>
	)
}
