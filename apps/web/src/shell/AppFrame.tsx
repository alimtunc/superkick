import type { ReactNode } from 'react'

import { useAttentionReporter } from '@/hooks/useAttentionReporter'
import { ProjectSwitchOverlay } from '@/shell/ProjectSwitchOverlay'

import { AppToaster } from './AppToaster'

interface AppFrameProps {
	children: ReactNode
}

export function AppFrame({ children }: AppFrameProps) {
	useAttentionReporter()
	return (
		<div className="flex h-screen bg-canvas">
			{children}
			<ProjectSwitchOverlay />
			<AppToaster />
		</div>
	)
}
