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

const DOT_TONE: Record<LifecycleBucket, string> = {
	needs: 'var(--status-needs)',
	active: 'var(--status-progress)',
	launchable: 'var(--accent)',
	open: 'var(--fg-dim)',
	done: 'var(--fg-dim)'
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
			className={cn('group-head sticky w-full text-left', pinned ? 'group-head--pinned' : null)}
		>
			<Icon name={collapsed ? 'chev' : 'chevDown'} size={11} className="shrink-0 text-fg-dim" />
			{statusKind ? (
				<StatusIcon kind={pinned ? 'needs' : statusKind} size={14} />
			) : (
				<span
					aria-hidden="true"
					className="inline-block size-2 shrink-0 rounded-full"
					style={{ background: bucket ? DOT_TONE[bucket] : 'var(--fg-dim)' }}
				/>
			)}
			<span className="group-head__name">{label}</span>
			<span className="group-head__count">{count}</span>
			<span className="group-head__spacer" />
			<span aria-hidden="true" className="iconbtn" style={{ width: 22, height: 22 }}>
				<Icon name="plus" size={14} className="ic" />
			</span>
		</button>
	)
}
