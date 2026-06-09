import { cn } from '@/lib/utils'
import type { ShellNavId } from '@/types'
import type { SKIconName } from '@/types/icons'
import type { TaskBadgeKind } from '@/types/lifecycle'
import { Avatar } from '@/ui/Avatar'
import { Icon } from '@/ui/Icon'
import { Link } from '@tanstack/react-router'

interface SidebarProps {
	active: ShellNavId
	counts?: Partial<Record<Exclude<ShellNavId, null>, number>>
	agentActive?: boolean
}

interface PrimaryNavItem {
	id: Exclude<ShellNavId, null>
	to: string
	icon: SKIconName
	label: string
}

const PRIMARY: PrimaryNavItem[] = [
	{ id: 'inbox', to: '/', icon: 'inbox', label: 'Inbox' },
	{ id: 'board', to: '/board', icon: 'layers', label: 'Board' },
	{ id: 'issues', to: '/issues', icon: 'issue', label: 'Issues' },
	{ id: 'agents', to: '/agents', icon: 'agent', label: 'Agents' },
	{ id: 'settings', to: '/settings', icon: 'settings', label: 'Settings' }
]

interface SavedView {
	to: string
	icon: SKIconName
	label: string
}

const SAVED_VIEWS: SavedView[] = [
	{ to: '/attention', icon: 'pin', label: 'Needs you' },
	{ to: '/issues', icon: 'star', label: 'My issues' },
	{ to: '/issues', icon: 'pr', label: 'In review' },
	{ to: '/issues', icon: 'clock', label: 'Shipped this week' }
]

interface NavRowProps {
	to: string
	icon: SKIconName
	label: string
	active?: boolean
	count?: number
	dot?: TaskBadgeKind
}

function NavRow({ to, icon, label, active = false, count, dot }: NavRowProps) {
	return (
		<Link to={to} className={cn('navitem', active && 'navitem--active')}>
			<Icon name={icon} size={16} className="ic" />
			<span className="flex-1">{label}</span>
			{typeof count === 'number' ? <span className="navitem__count">{count}</span> : null}
			{dot ? <span className={cn('navitem__dot agdot', `agdot--${dot}`)} /> : null}
		</Link>
	)
}

export function Sidebar({ active, counts, agentActive = false }: SidebarProps) {
	return (
		<aside className="sidebar">
			<div className="sidebar__brand">
				<div className="sidebar__logo">S</div>
				<div className="sidebar__brandname">
					Superkick <span className="meta">· local</span>
				</div>
			</div>

			<div className="sidebar__scroll">
				<div className="navgroup">
					{PRIMARY.map((item) => (
						<NavRow
							key={item.id}
							to={item.to}
							icon={item.icon}
							label={item.label}
							active={active === item.id}
							count={counts?.[item.id]}
							dot={item.id === 'agents' && agentActive ? 'running' : undefined}
						/>
					))}
				</div>

				<div className="navgroup">
					<div className="navgroup__label">Saved views</div>
					{SAVED_VIEWS.map((view) => (
						<NavRow key={view.label} to={view.to} icon={view.icon} label={view.label} />
					))}
				</div>
			</div>

			<div className="sidebar__footer">
				<div className="navitem">
					<Avatar name="You" id="local-operator" size={20} />
					<span className="flex-1">You</span>
					<Icon name="chevDown" size={14} className="ic" />
				</div>
			</div>
		</aside>
	)
}
