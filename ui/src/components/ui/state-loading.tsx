import { cn } from '@/lib/utils'

interface LoadingStateProps {
	rows?: number
	className?: string
	density?: 'compact' | 'default'
}

export function LoadingState({ rows = 2, className, density = 'default' }: LoadingStateProps) {
	const compact = density === 'compact'
	return (
		<div
			className={cn('divide-y divide-edge/50 overflow-hidden rounded-md border border-edge', className)}
			role="status"
			aria-busy="true"
			aria-label="Loading"
		>
			{Array.from({ length: rows }, (_, idx) => (
				<div key={idx} className={cn('flex items-center gap-3 px-3', compact ? 'py-1.5' : 'py-2.5')}>
					<div className="h-3 w-12 animate-pulse rounded bg-edge/40" />
					<div className="h-3 w-20 animate-pulse rounded bg-edge/40" />
					<div className="h-2.5 flex-1 animate-pulse rounded bg-edge/30" />
				</div>
			))}
		</div>
	)
}
