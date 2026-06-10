import { SETTINGS_NAV_GROUPS, settingsNavItemsForScope } from '@/components/settings/settingsNav'
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuLabel
} from '@/components/ui/sidebar'
import { isDesktopShell } from '@/lib/desktop'
import { activeDesktopProjectName, desktopProjectsQuery } from '@/lib/desktopProjects'
import type { SettingsPaneId } from '@/types'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

interface SettingsSidebarProps {
	activeId: SettingsPaneId
}

export function SettingsSidebar({ activeId }: SettingsSidebarProps) {
	const navigate = useNavigate()
	const inDesktopShell = isDesktopShell()
	const { data: registry } = useQuery({ ...desktopProjectsQuery(), enabled: inDesktopShell })
	const projectName = inDesktopShell ? activeDesktopProjectName(registry) : null

	const groups = SETTINGS_NAV_GROUPS.map((group) => ({
		...group,
		suffix: group.scope === 'project' ? projectName : null
	}))

	return (
		<Sidebar collapsible="none" className="w-50">
			<SidebarHeader className="px-3 pt-4.5 pb-0">
				<button
					type="button"
					onClick={() => navigate({ to: '/' })}
					className="mb-3 flex items-center gap-1.5 rounded-md px-2.5 py-1.75 text-left text-[12.5px] text-fg-muted transition-colors hover:text-fg"
				>
					<ArrowLeft size={14} strokeWidth={1.75} aria-hidden="true" />
					Back to app
				</button>
				<div className="px-2.5 text-[13px] font-semibold tracking-tight text-fg">Settings</div>
			</SidebarHeader>
			<SidebarContent>
				{groups.map((group) => (
					<SidebarGroup key={group.scope}>
						<SidebarGroupLabel className="gap-1 font-medium">
							<span className="flex-none">{group.label}</span>
							{group.suffix ? <span className="truncate">· {group.suffix}</span> : null}
						</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								{settingsNavItemsForScope(group.scope).map((item) => (
									<SidebarMenuItem key={item.id}>
										<SidebarMenuButton
											isActive={item.id === activeId}
											render={<Link to="/settings" search={{ pane: item.id }} />}
										>
											<SidebarMenuLabel>{item.label}</SidebarMenuLabel>
										</SidebarMenuButton>
									</SidebarMenuItem>
								))}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				))}
			</SidebarContent>
		</Sidebar>
	)
}
