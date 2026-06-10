import {
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuLabel,
	SidebarRail,
	Sidebar as SidebarRoot
} from '@/components/ui/sidebar'
import { isDesktopShell } from '@/lib/desktop'
import { cn } from '@/lib/utils'
import type { ShellNavId } from '@/types'
import type { SKIconName } from '@/types/icons'
import type { TaskBadgeKind } from '@/types/lifecycle'
import { Icon } from '@/ui/Icon'
import { Link } from '@tanstack/react-router'

import { ProjectSwitcher } from './ProjectSwitcher'
import { UserMenu } from './UserMenu'

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
	{ id: 'agents', to: '/agents', icon: 'agent', label: 'Agents' }
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
		<SidebarMenuItem>
			<SidebarMenuButton
				isActive={active}
				tooltip={label}
				render={<Link to={to} />}
				className={active ? 'bg-accent-soft' : undefined}
			>
				<Icon
					name={icon}
					size={16}
					className={cn('flex-none', active ? 'text-accent' : 'text-fg-dim')}
				/>
				<SidebarMenuLabel className="min-w-0 flex-1">{label}</SidebarMenuLabel>
				{typeof count === 'number' ? (
					<SidebarMenuBadge className={active ? 'text-fg-muted' : undefined}>
						{count}
					</SidebarMenuBadge>
				) : null}
			</SidebarMenuButton>
			{dot ? (
				<span
					aria-hidden="true"
					className={cn('agdot pointer-events-none absolute top-1 right-1', `agdot--${dot}`)}
				/>
			) : null}
		</SidebarMenuItem>
	)
}

export function Sidebar({ active, counts, agentActive = false }: SidebarProps) {
	return (
		<SidebarRoot collapsible="icon">
			<SidebarHeader className="h-(--topbar-h) justify-center border-b border-(--border-faint)">
				<div className="flex items-center gap-2 px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
					<div className="flex size-5.5 flex-none items-center justify-center rounded-sm bg-accent text-[12px] font-semibold text-white">
						S
					</div>
					{isDesktopShell() ? (
						<div className="flex min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
							<ProjectSwitcher />
						</div>
					) : (
						<SidebarMenuLabel className="text-[13px] font-semibold text-fg">
							Superkick <span className="font-normal text-fg-dim">· local</span>
						</SidebarMenuLabel>
					)}
				</div>
			</SidebarHeader>

			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu>
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
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>

				<SidebarGroup>
					<SidebarGroupLabel>Saved views</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{SAVED_VIEWS.map((view) => (
								<NavRow key={view.label} to={view.to} icon={view.icon} label={view.label} />
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>

			<SidebarFooter className="border-t border-(--border-faint)">
				<UserMenu />
			</SidebarFooter>

			<SidebarRail />
		</SidebarRoot>
	)
}
