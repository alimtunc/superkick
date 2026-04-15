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
				'group relative flex h-7 items-center gap-1.5 rounded border px-2 transition-colors',
				hot && 'border-oxide/40 bg-oxide-dim text-oxide hover:border-oxide/60',
				!hot && count > 0 && 'border-gold/40 text-gold hover:border-gold/60',
				count === 0 && 'border-edge text-dim hover:text-silver'
			)}
			title={count > 0 ? `${count} need attention` : 'No attention items'}
		>
			<span className="relative">
				<Bell size={12} />
				{hot ? (
					<span className="live-pulse absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-oxide" />
				) : null}
			</span>
			<span className="font-data text-[11px]">{count}</span>
		</Link>
	)
}
