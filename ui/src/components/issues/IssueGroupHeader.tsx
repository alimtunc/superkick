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
				'sticky top-0 z-[2] flex h-8 w-full items-center gap-[9px] border-b pr-6 pl-5 text-left transition-colors hover:bg-raised',
				pinned
					? 'border-t border-t-[color-mix(in_srgb,var(--color-warn)_25%,var(--color-border))] border-b-[color-mix(in_srgb,var(--color-warn)_25%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-warn)_8%,var(--color-surface))]'
					: 'border-border bg-surface'
			)}
		>
			<Icon name={collapsed ? 'chev' : 'chevDown'} size={11} className="shrink-0 text-fg-dim" />
			{statusKind ? (
				<StatusIcon kind={statusKind} size={14} />
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
					pinned ? 'tracking-[0.2px] text-warn' : 'text-fg'
				)}
			>
				{label}
			</span>
			<span className="font-data text-[11px] text-fg-dim">{count}</span>
			{pinned ? (
				<span className="ml-0.5 inline-flex items-center rounded border border-[color-mix(in_srgb,var(--color-warn)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-warn)_8%,transparent)] px-1.5 py-px text-[10.5px] font-medium tracking-[0.4px] text-warn uppercase">
					Pinned
				</span>
			) : null}
			<span className="flex-1" />
			<span aria-hidden="true" className="flex items-center gap-1 text-fg-dim">
				<Icon name="plus" size={12} />
				<Icon name="more" size={13} />
			</span>
		</button>
	)
}
