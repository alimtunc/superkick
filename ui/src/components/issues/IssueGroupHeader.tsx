import { cn } from '@/lib/utils'
import type { LifecycleBucket } from '@/types'
import { Icon } from '@/ui'

interface IssueGroupHeaderProps {
	label: string
	count: number
	bucket: LifecycleBucket | null
	collapsed: boolean
	onToggle: () => void
}

const DOT_CLASS: Record<LifecycleBucket, string> = {
	needs: 'bg-warn',
	active: 'bg-info',
	launchable: 'bg-accent',
	open: 'bg-fg-dim',
	done: 'bg-fg-dim'
}

export function IssueGroupHeader({ label, count, bucket, collapsed, onToggle }: IssueGroupHeaderProps) {
	return (
		<button
			type="button"
			onClick={onToggle}
			aria-expanded={!collapsed}
			className="sticky top-0 z-30 flex h-8 w-full items-center gap-2 border-b border-border bg-surface px-6 text-left transition-colors hover:bg-raised"
		>
			<Icon
				name="chev"
				size={12}
				className={cn(
					'shrink-0 text-fg-dim transition-transform',
					collapsed ? 'rotate-0' : 'rotate-90'
				)}
			/>
			<span
				aria-hidden="true"
				className={cn(
					'inline-block size-2 shrink-0 rounded-full',
					bucket ? DOT_CLASS[bucket] : 'bg-fg-dim'
				)}
			/>
			<span className="text-[12px] font-medium text-fg">{label}</span>
			<span className="font-data text-[11px] text-fg-dim">{count}</span>
		</button>
	)
}
