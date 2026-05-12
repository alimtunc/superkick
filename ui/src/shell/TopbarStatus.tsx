import { useDashboardRuns } from '@/hooks/useDashboardRuns'
import { cn } from '@/lib/utils'
import { Btn } from '@/ui/Btn'
import { Dot } from '@/ui/Dot'
import { Icon } from '@/ui/Icon'
import { Link } from '@tanstack/react-router'

function formatClock(date: Date): string {
	return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function attentionLinkClasses(hot: boolean, count: number): string {
	if (hot) return 'border-transparent bg-danger-soft text-danger hover:brightness-110'
	if (count > 0) return 'border-transparent bg-warn-soft text-warn hover:brightness-110'
	return 'border-border bg-raised text-fg-dim hover:text-fg-muted'
}

export function TopbarStatus() {
	const { lastRefresh, active, needsAttention, aging, loading, refresh } = useDashboardRuns()
	const attentionCount = needsAttention.length + aging.length
	const hot = needsAttention.length > 0

	return (
		<>
			<span className="font-mono text-[11px] text-fg-dim">{formatClock(lastRefresh)}</span>
			{active.length > 0 ? (
				<span className="flex items-center gap-1.5 font-mono text-[11px] text-info">
					<Dot tone="info" size={6} pulse />
					{active.length} active
				</span>
			) : (
				<span className="font-mono text-[11px] text-fg-dim">idle</span>
			)}
			<Link
				to="/attention"
				className={cn(
					'inline-flex h-7 items-center gap-1.5 rounded-[7px] border px-2 transition-colors',
					'focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none',
					attentionLinkClasses(hot, attentionCount)
				)}
				title={attentionCount > 0 ? `${attentionCount} need attention` : 'No attention items'}
				aria-label={attentionCount > 0 ? `${attentionCount} need attention` : 'No attention items'}
			>
				<Icon name="alert" size={12} />
				<span className="font-mono text-[11px]">{attentionCount}</span>
			</Link>
			<Btn
				kind="surface"
				size="sm"
				icon="loop"
				onClick={() => refresh()}
				disabled={loading}
				aria-label="Refresh dashboard"
			/>
		</>
	)
}
