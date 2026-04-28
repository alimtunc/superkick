import type { IssueStatus } from '@/types'

interface StatusChipProps {
	status: IssueStatus
}

export function StatusChip({ status }: StatusChipProps) {
	return (
		<span
			className="font-data inline-flex h-5 shrink-0 items-center rounded-md border px-2 text-[11px] leading-none whitespace-nowrap"
			style={{
				color: status.color,
				borderColor: `color-mix(in oklch, ${status.color} 30%, transparent)`,
				backgroundColor: `color-mix(in oklch, ${status.color} 10%, transparent)`
			}}
		>
			{status.name}
		</span>
	)
}
