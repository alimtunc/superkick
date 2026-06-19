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
} from '@/components/composites/sidebar'
import { Icon } from '@/components/primitives'
import { isDesktopShell } from '@/lib/desktop'
import type { IssuesSearch } from '@/lib/issues/searchParams'
import { cn } from '@/lib/utils'
import type { ShellNavId } from '@/types'
import type { SKIconName } from '@/types/icons'
import type { TaskBadgeKind } from '@/types/lifecycle'
import { Link, useRouterState } from '@tanstack/react-router'

import { ProjectSwitcher } from './ProjectSwitcher'
import { SidebarSearch } from './SidebarSearch'
import { UserMenu } from './UserMenu'

interface SidebarProps {
	active: ShellNavId
	counts?: Partial<Record<Exclude<ShellNavId, null>, number>>
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
	{ id: 'reviews', to: '/reviews', icon: 'pr', label: 'Reviews' },
	{ id: 'issues', to: '/issues', icon: 'issue', label: 'Issues' }
]

const WORKSPACE: PrimaryNavItem[] = [
	{ id: 'agents', to: '/agents', icon: 'agent', label: 'Agents' },
	{ id: 'skills', to: '/skills', icon: 'spark', label: 'Skills' }
]

interface SavedView {
	to: string
	search?: IssuesSearch
	icon: SKIconName
	label: string
}

const SAVED_VIEWS: SavedView[] = [
	{ to: '/', icon: 'inbox', label: 'Needs you' },
	{ to: '/issues', search: { tab: 'mine', sort: 'updated' }, icon: 'star', label: 'My issues' },
	{
		to: '/issues',
		search: { tab: 'all-open', group: 'status', task: ['review'] },
		icon: 'pr',
		label: 'In review'
	},
	{ to: '/issues', search: { tab: 'shipped', sort: 'updated' }, icon: 'clock', label: 'Shipped this week' }
]

function isSavedViewActive(view: SavedView, pathname: string, search: Record<string, unknown>): boolean {
	if (view.to !== pathname) return false
	if (!view.search) return true
	return Object.entries(view.search).every(([key, value]) => {
		const current = search[key]
		if (Array.isArray(value)) {
			return (
				Array.isArray(current) &&
				current.length === value.length &&
				value.every((v) => current.includes(v))
			)
		}
		return current === value
	})
}

interface NavRowProps {
	to: string
	search?: IssuesSearch
	icon: SKIconName
	label: string
	active?: boolean
	count?: number
	dot?: TaskBadgeKind
}

function NavRow({ to, search, icon, label, active = false, count, dot }: NavRowProps) {
	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				isActive={active}
				tooltip={label}
				render={<Link to={to} search={search} />}
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

export function Sidebar({ active, counts }: SidebarProps) {
	const location = useRouterState({ select: (s) => s.location })
	const currentSearch = location.search as Record<string, unknown>

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
							<SidebarSearch />
							{PRIMARY.map((item) => (
								<NavRow
									key={item.id}
									to={item.to}
									icon={item.icon}
									label={item.label}
									active={active === item.id}
									count={counts?.[item.id]}
								/>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>

				<SidebarGroup>
					<SidebarGroupLabel>Workspace</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{WORKSPACE.map((item) => (
								<NavRow
									key={item.id}
									to={item.to}
									icon={item.icon}
									label={item.label}
									active={active === item.id}
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
								<NavRow
									key={view.label}
									to={view.to}
									search={view.search}
									icon={view.icon}
									label={view.label}
									active={isSavedViewActive(view, location.pathname, currentSearch)}
								/>
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
