import type { ReactNode } from 'react'

import { useAttentionReporter } from '@/hooks/useAttentionReporter'
import { isDesktopShell } from '@/lib/desktop'
import { ProjectRail } from '@/shell/ProjectRail'
import { ProjectSwitchOverlay } from '@/shell/ProjectSwitchOverlay'

import { AppToaster } from './AppToaster'

interface AppFrameProps {
	children: ReactNode
}

export function AppFrame({ children }: AppFrameProps) {
	useAttentionReporter()
	return (
		<div className="flex h-screen bg-canvas">
			{isDesktopShell() ? <ProjectRail /> : null}
			{children}
			<ProjectSwitchOverlay />
			<AppToaster />
		</div>
	)
}
