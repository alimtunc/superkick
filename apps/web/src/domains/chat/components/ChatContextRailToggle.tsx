import { Button, Tooltip } from '@/components/primitives'
import { useWorkspaceContextRailStore } from '@/stores/workspaceContextRail'
import { PanelRightClose, PanelRightOpen } from 'lucide-react'

export function ChatContextRailToggle() {
	const railOpen = useWorkspaceContextRailStore((s) => s.open)
	const toggleRail = useWorkspaceContextRailStore((s) => s.toggleRail)

	return (
		<div className="absolute top-2 right-2 z-sticky">
			<Tooltip label={railOpen ? 'Hide context' : 'Show context'}>
				<Button
					variant="outline"
					size="icon-xs"
					onClick={toggleRail}
					aria-label={railOpen ? 'Hide workspace context' : 'Show workspace context'}
					aria-pressed={railOpen}
				>
					{railOpen ? (
						<PanelRightClose size={13} strokeWidth={1.75} aria-hidden="true" />
					) : (
						<PanelRightOpen size={13} strokeWidth={1.75} aria-hidden="true" />
					)}
				</Button>
			</Tooltip>
		</div>
	)
}
