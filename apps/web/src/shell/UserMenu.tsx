import { MENU_ITEM_CLASS, MenuPopup } from '@/components/composites/menu-shell'
import { SidebarMenuButton, SidebarMenuLabel } from '@/components/composites/sidebar'
import { Avatar, Icon } from '@/components/primitives'
import { useViewer } from '@/hooks/useViewer'
import { linearStatusDisplay } from '@/lib/linearStatus'
import { THEME_OPTIONS, themeButtonClass } from '@/lib/themeOptions'
import { useThemeStore } from '@/stores/theme'
import { Menu } from '@base-ui/react/menu'
import { useNavigate } from '@tanstack/react-router'
import { Settings } from 'lucide-react'

export function UserMenu() {
	const { viewer, loading } = useViewer()
	const mode = useThemeStore((s) => s.mode)
	const setMode = useThemeStore((s) => s.setMode)
	const navigate = useNavigate()

	const displayName = viewer?.name ?? 'You'
	const linearStatus = `Linear · ${linearStatusDisplay(viewer, loading).label}`

	return (
		<Menu.Root>
			<SidebarMenuButton render={<Menu.Trigger />} className="cursor-pointer">
				<Avatar name={displayName} id={viewer?.id ?? 'local-operator'} size={20} />
				<SidebarMenuLabel className="min-w-0 flex-1">{displayName}</SidebarMenuLabel>
				<Icon
					name="chevDown"
					size={14}
					className="flex-none text-fg-dim group-data-[collapsible=icon]:hidden"
				/>
			</SidebarMenuButton>
			<MenuPopup align="start" side="top" popupClassName="min-w-56">
				<div className="px-3 py-2">
					<div className="text-[12.5px] font-medium text-fg">{displayName}</div>
					<div className="text-[11px] text-fg-muted">{linearStatus}</div>
				</div>
				<div className="h-px bg-border" />
				<Menu.Item onClick={() => navigate({ to: '/settings' })} className={MENU_ITEM_CLASS}>
					<Settings size={13} strokeWidth={1.75} aria-hidden="true" className="text-fg-dim" />
					Settings
				</Menu.Item>
				<div className="flex items-center justify-between px-3 py-2">
					<span className="text-[11px] text-fg-muted">Theme</span>
					<div className="flex items-center gap-0.5">
						{THEME_OPTIONS.map((option) => (
							<button
								key={option.mode}
								type="button"
								aria-label={`${option.label} theme`}
								aria-pressed={mode === option.mode}
								className={themeButtonClass(mode === option.mode)}
								onClick={() => setMode(option.mode)}
							>
								<option.icon size={13} strokeWidth={1.75} aria-hidden="true" />
							</button>
						))}
					</div>
				</div>
			</MenuPopup>
		</Menu.Root>
	)
}
