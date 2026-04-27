import { PrStateBadge } from '@/components/PrStateBadge'
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
				'font-data inline-flex h-5 items-center gap-1.5 rounded border border-neon-green/30 bg-neon-green/10 px-1.5 text-[10px] text-neon-green transition-colors hover:border-neon-green/50',
				className
			)}
		>
			#{pr.number}
			<PrStateBadge state={pr.state} />
		</a>
	)
}
