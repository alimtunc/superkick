import { SidebarMenuButton, SidebarMenuItem, SidebarMenuLabel } from '@/components/composites/sidebar'
import { Icon } from '@/components/primitives'
import { useCommandBarStore } from '@/stores/commandBar'

export function SidebarSearch() {
	const openBar = useCommandBarStore((s) => s.openBar)

	return (
		<SidebarMenuItem>
			<SidebarMenuButton tooltip="Search" onClick={openBar} aria-label="Search">
				<Icon name="search" size={16} className="flex-none text-fg-dim" />
				<SidebarMenuLabel className="min-w-0 flex-1">Search</SidebarMenuLabel>
				<kbd className="pointer-events-none ml-auto font-mono text-[10px] text-fg-faint group-data-[collapsible=icon]:hidden">
					⌘K
				</kbd>
			</SidebarMenuButton>
		</SidebarMenuItem>
	)
}
