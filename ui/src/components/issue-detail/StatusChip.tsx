import type { IssueDetailResponse } from '@/types'

interface StatusChipProps {
	status: IssueDetailResponse['status']
}

export function StatusChip({ status }: StatusChipProps) {
	return (
		<span
			className="inline-block rounded px-2 py-0.5 text-[10px] font-medium"
			style={{
				color: status.color,
				backgroundColor: `color-mix(in oklch, ${status.color} 8%, transparent)`
			}}
		>
			{status.name}
		</span>
	)
}
