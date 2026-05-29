import { PrStateBadge } from '@/components/PrStateBadge'
import { Pill } from '@/components/ui/pill'
import { cn } from '@/lib/utils'
import type { LinkedPrSummary } from '@/types'

interface RunPrBadgeProps {
	pr: LinkedPrSummary
	className?: string
}

export function RunPrBadge({ pr, className }: RunPrBadgeProps) {
	return (
		<a
			href={pr.url}
			target="_blank"
			rel="noopener noreferrer"
			className={cn(
				'inline-flex shrink-0 rounded-md focus-visible:ring-2 focus-visible:ring-success/40 focus-visible:outline-none',
				className
			)}
		>
			<Pill tone="success" size="xs" interactive>
				#{pr.number}
				<PrStateBadge state={pr.state} />
			</Pill>
		</a>
	)
}
