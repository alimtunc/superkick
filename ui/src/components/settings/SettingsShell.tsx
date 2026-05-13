import type { ReactNode } from 'react'

import { SETTINGS_NAV_ITEMS } from '@/components/settings/settingsNav'
import { cn } from '@/lib/utils'
import type { SettingsPaneId } from '@/types'

interface SettingsShellProps {
	activeId: SettingsPaneId
	onSelect: (id: SettingsPaneId) => void
	children: ReactNode
}

export function SettingsShell({ activeId, onSelect, children }: SettingsShellProps) {
	return (
		<div className="flex h-full min-h-0">
			<nav className="flex w-50 flex-none flex-col gap-px border-r border-border bg-surface px-3 py-[18px]">
				{SETTINGS_NAV_ITEMS.map((item) => {
					const isActive = item.id === activeId
					return (
						<button
							key={item.id}
							type="button"
							onClick={() => onSelect(item.id)}
							className={cn(
								'rounded-md px-[10px] py-[7px] text-left text-[12.5px] transition-colors',
								isActive ? 'bg-raised font-medium text-fg' : 'text-fg-muted hover:text-fg'
							)}
						>
							{item.label}
						</button>
					)
				})}
			</nav>
			<div className="min-h-0 flex-1 overflow-auto px-8 py-6">
				<div className="max-w-[780px]">{children}</div>
			</div>
		</div>
	)
}
