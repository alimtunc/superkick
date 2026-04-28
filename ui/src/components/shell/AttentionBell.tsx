import { useDashboardRuns } from '@/hooks/useDashboardRuns'
import { cn } from '@/lib/utils'
import { Link } from '@tanstack/react-router'
import { Bell } from 'lucide-react'

export function AttentionBell() {
	const { needsAttention, aging } = useDashboardRuns()
	const count = needsAttention.length + aging.length
	const hot = needsAttention.length > 0

	return (
		<Link
			to="/attention"
			className={cn(
				'group relative flex h-7 items-center gap-1.5 rounded-md border px-2 transition-colors focus-visible:ring-2 focus-visible:ring-mineral/40 focus-visible:outline-none',
				hot && 'border-oxide/40 bg-oxide-dim text-oxide hover:border-oxide/60',
				!hot && count > 0 && 'border-gold/40 bg-gold-dim text-gold hover:border-gold/60',
				count === 0 &&
					'border-edge bg-graphite/60 text-ash hover:border-edge-bright hover:text-silver'
			)}
			title={count > 0 ? `${count} need attention` : 'No attention items'}
			aria-label={count > 0 ? `${count} need attention` : 'No attention items'}
		>
			<span className="relative">
				<Bell size={12} strokeWidth={1.75} aria-hidden="true" />
				{hot ? (
					<span
						className="live-pulse absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-oxide"
						aria-hidden="true"
					/>
				) : null}
			</span>
			<span className="font-data text-[11px]">{count}</span>
		</Link>
	)
}
