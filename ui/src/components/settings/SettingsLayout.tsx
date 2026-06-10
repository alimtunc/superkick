import type { ReactNode } from 'react'

import { SettingsSidebar } from '@/components/settings/SettingsSidebar'
import { AppFrame } from '@/components/shell/AppFrame'
import type { SettingsPaneId } from '@/types'

interface SettingsLayoutProps {
	activeId: SettingsPaneId
	children: ReactNode
}

export function SettingsLayout({ activeId, children }: SettingsLayoutProps) {
	return (
		<AppFrame>
			<SettingsSidebar activeId={activeId} />
			<div className="min-h-0 flex-1 overflow-auto px-8 py-6">
				<div className="max-w-195">{children}</div>
			</div>
		</AppFrame>
	)
}
