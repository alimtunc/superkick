import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AlertTriangle } from 'lucide-react'

interface ErrorStateProps {
	title?: string
	message: string
	onRetry?: () => void
	retryLabel?: string
	className?: string
	density?: 'compact' | 'default'
}

export function ErrorState({
	title,
	message,
	onRetry,
	retryLabel = 'Retry',
	className,
	density = 'default'
}: ErrorStateProps) {
	const compact = density === 'compact'
	return (
		<div
			role="alert"
			className={cn(
				'flex items-center justify-between gap-3 rounded-md border border-danger/40 bg-danger-soft',
				compact ? 'px-3 py-2' : 'px-4 py-3',
				className
			)}
		>
			<div className="flex items-start gap-2">
				<AlertTriangle
					size={compact ? 14 : 16}
					strokeWidth={1.75}
					className="mt-0.5 shrink-0 text-danger"
					aria-hidden="true"
				/>
				<div className="flex flex-col gap-0.5">
					{title ? (
						<p className={cn('font-medium text-danger', compact ? 'text-xs' : 'text-sm')}>
							{title}
						</p>
					) : null}
					<p className={cn('text-fg-muted', compact ? 'text-[11px]' : 'text-xs')}>{message}</p>
				</div>
			</div>
			{onRetry ? (
				<Button variant="outline" size={compact ? 'xs' : 'sm'} onClick={onRetry} className="shrink-0">
					{retryLabel}
				</Button>
			) : null}
		</div>
	)
}
