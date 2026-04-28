import { cn } from '@/lib/utils'
import { Link, useMatches } from '@tanstack/react-router'
import { Bot, Inbox, ListTodo, Play, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface NavItem {
	to: string
	label: string
	icon: LucideIcon
	matchPrefix?: string
}

const NAV_ITEMS: NavItem[] = [
	{ to: '/', label: 'Inbox', icon: Inbox },
	{ to: '/issues', label: 'Issues', icon: ListTodo, matchPrefix: '/issues' },
	{ to: '/runs', label: 'Runs', icon: Play, matchPrefix: '/runs' },
	{ to: '/agents', label: 'Agents', icon: Bot }
]

const BOTTOM_ITEMS: NavItem[] = [{ to: '/settings', label: 'Settings', icon: Settings }]

function isActive(item: NavItem, pathname: string): boolean {
	if (item.matchPrefix) {
		return pathname.startsWith(item.matchPrefix)
	}
	return pathname === item.to
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
	const active = isActive(item, pathname)
	const Icon = item.icon
	return (
		<Link
			to={item.to}
			className={cn(
				'group flex h-8 items-center gap-2.5 rounded-md border-l-2 px-2.5 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-mineral/40 focus-visible:outline-none',
				active
					? 'border-l-mineral bg-slate-deep text-fog'
					: 'border-l-transparent text-silver hover:bg-slate-deep/60 hover:text-fog'
			)}
		>
			<Icon
				size={16}
				strokeWidth={1.75}
				aria-hidden="true"
				className={cn(
					'shrink-0 transition-colors',
					active ? 'text-mineral' : 'text-ash group-hover:text-silver'
				)}
			/>
			{item.label}
		</Link>
	)
}

export function Sidebar() {
	const matches = useMatches()
	const pathname = matches[matches.length - 1]?.pathname ?? '/'

	return (
		<aside className="flex h-screen w-52 shrink-0 flex-col border-r border-edge bg-carbon">
			{/* Brand */}
			<div className="flex h-12 items-center gap-2 border-b border-edge px-4">
				<div className="live-pulse h-2 w-2 rounded-full bg-neon-green" />
				<span className="font-data text-[11px] tracking-wider text-silver uppercase">Superkick</span>
			</div>

			{/* Main nav */}
			<nav className="flex-1 space-y-1 px-2 py-3">
				{NAV_ITEMS.map((item) => (
					<NavLink key={item.to} item={item} pathname={pathname} />
				))}
			</nav>

			{/* Bottom nav */}
			<nav className="space-y-1 border-t border-edge px-2 py-3">
				{BOTTOM_ITEMS.map((item) => (
					<NavLink key={item.to} item={item} pathname={pathname} />
				))}
			</nav>
		</aside>
	)
}
