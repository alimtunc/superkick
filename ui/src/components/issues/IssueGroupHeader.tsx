import { cn } from '@/lib/utils'
import type { LifecycleBucket, StatusIconKind } from '@/types'
import { Icon, StatusIcon } from '@/ui'

interface IssueGroupHeaderProps {
	label: string
	count: number
	bucket: LifecycleBucket | null
	statusKind: StatusIconKind | null
	pinned: boolean
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

export function IssueGroupHeader({
	label,
	count,
	bucket,
	statusKind,
	pinned,
	collapsed,
	onToggle
}: IssueGroupHeaderProps) {
	return (
		<button
			type="button"
			onClick={onToggle}
			aria-expanded={!collapsed}
			data-pinned={pinned ? '1' : '0'}
			className={cn(
				'sticky top-0 z-30 flex h-9 w-full items-center gap-2 border-b pr-6 pl-5 text-left transition-colors hover:bg-raised',
				pinned
					? 'border-t border-t-warn/25 border-b-warn/30 bg-warn-soft'
					: 'border-border bg-surface'
			)}
		>
			<Icon
				name="chev"
				size={11}
				className={cn(
					'shrink-0 text-fg-dim transition-transform',
					collapsed ? 'rotate-0' : 'rotate-90'
				)}
			/>
			{statusKind ? (
				<StatusIcon kind={statusKind} size={13} />
			) : (
				<span
					aria-hidden="true"
					className={cn(
						'inline-block size-2 shrink-0 rounded-full',
						bucket ? DOT_CLASS[bucket] : 'bg-fg-dim'
					)}
				/>
			)}
			<span
				className={cn(
					'text-[12.5px] font-semibold',
					pinned ? 'tracking-[0.01em] text-warn' : 'text-fg'
				)}
			>
				{label}
			</span>
			<span className="font-data text-[11px] text-fg-dim">{count}</span>
			{pinned ? (
				<span className="ml-0.5 inline-flex items-center rounded border border-warn/30 bg-warn-soft/60 px-1 text-[9.5px] font-semibold tracking-[0.04em] text-warn uppercase">
					Pinned
				</span>
			) : null}
		</button>
	)
}
