import { cn } from '@/lib/utils'
import { useCommandBarStore } from '@/stores/commandBar'
import type { ShellNavId } from '@/types'
import type { SKIconName } from '@/types/icons'
import { Avatar } from '@/ui/Avatar'
import { Icon } from '@/ui/Icon'
import { Kbd } from '@/ui/Kbd'
import { Link } from '@tanstack/react-router'

interface SidebarProps {
	active: ShellNavId
	counts?: Partial<Record<Exclude<ShellNavId, null>, number>>
}

interface NavItem {
	id: Exclude<ShellNavId, null>
	to: string
	icon: SKIconName
	label: string
	badgeTone?: 'accent' | 'muted'
}

const NAV: NavItem[] = [
	{ id: 'inbox', to: '/', icon: 'inbox', label: 'Inbox', badgeTone: 'accent' },
	{ id: 'issues', to: '/issues', icon: 'issue', label: 'Issues', badgeTone: 'muted' },
	{ id: 'agents', to: '/agents', icon: 'agent', label: 'Agents', badgeTone: 'muted' }
]

interface NavRowProps {
	item: NavItem
	active: boolean
	badge?: number
}

function NavRow({ item, active, badge }: NavRowProps) {
	const showBadge = typeof badge === 'number'
	return (
		<Link
			to={item.to}
			className={cn(
				'group relative flex items-center gap-2.5 rounded-[7px] px-2.5 py-[7px] text-[13.5px] transition-colors',
				'focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none',
				active ? 'bg-raised font-medium text-fg' : 'text-fg-muted hover:text-fg'
			)}
		>
			{active ? (
				<span
					aria-hidden="true"
					className="absolute top-[6px] bottom-[6px] left-0 w-[2px] rounded-[2px] bg-accent"
				/>
			) : null}
			<Icon
				name={item.icon}
				size={16}
				className={active ? 'text-fg' : 'text-fg-dim group-hover:text-fg-muted'}
			/>
			<span className="flex-1">{item.label}</span>
			{showBadge ? (
				<span
					className={cn(
						'rounded-full px-1.5 py-px font-mono text-[11px] font-semibold',
						item.badgeTone === 'accent' && badge > 0
							? 'bg-accent text-white'
							: 'bg-raised text-fg-muted'
					)}
				>
					{badge}
				</span>
			) : null}
		</Link>
	)
}

export function Sidebar({ active, counts }: SidebarProps) {
	const openBar = useCommandBarStore((s) => s.openBar)

	return (
		<aside className="flex h-full w-56 shrink-0 flex-col gap-0.5 border-r border-border bg-surface px-3 py-3.5">
			<div className="flex items-center gap-2.5 px-2 pt-1 pb-3">
				<span className="flex size-6.5 items-center justify-center rounded-[7px] bg-accent text-[13px] font-bold text-white">
					S
				</span>
				<div className="flex min-w-0 flex-1 flex-col">
					<span className="text-[13px] font-semibold text-fg">superkick</span>
					<span className="text-[11px] text-fg-dim">local workspace</span>
				</div>
			</div>

			<button
				type="button"
				onClick={openBar}
				className={cn(
					'mb-3 flex items-center gap-[7px] rounded-[7px] border border-border bg-raised px-2.5 py-1.5',
					'text-left text-[12.5px] text-fg-dim transition-colors',
					'hover:border-border-strong hover:text-fg-muted',
					'focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none'
				)}
			>
				<Icon name="search" size={14} className="text-fg-dim" />
				<span className="flex-1">Search</span>
				<Kbd>⌘K</Kbd>
			</button>

			<nav className="flex flex-col gap-0.5">
				{NAV.map((item) => (
					<NavRow key={item.id} item={item} active={active === item.id} badge={counts?.[item.id]} />
				))}
			</nav>

			<div className="flex-1" />

			<nav className="flex flex-col gap-0.5">
				<NavRow
					item={{
						id: 'settings',
						to: '/settings',
						icon: 'settings',
						label: 'Settings',
						badgeTone: 'muted'
					}}
					active={active === 'settings'}
				/>
			</nav>
			<div className="mt-2 flex items-center gap-2.5 p-2">
				<Avatar name="You" size={24} />
				<div className="flex min-w-0 flex-1 flex-col">
					<span className="text-[12.5px] font-medium text-fg">You</span>
					<span className="text-[11px] text-fg-dim">local operator</span>
				</div>
			</div>
		</aside>
	)
}
