import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { useWorkspaceChatStore } from '@/stores/workspaceChat'
import { MessageSquare } from 'lucide-react'

export function ChatToggleButton() {
	const open = useWorkspaceChatStore((s) => s.open)
	const toggle = useWorkspaceChatStore((s) => s.toggleChat)

	return (
		<Tooltip label={open ? 'Hide chat' : 'Open chat'}>
			<Button
				variant="outline"
				size="icon-xs"
				onClick={toggle}
				aria-label={open ? 'Hide chat' : 'Open chat'}
				aria-pressed={open}
				className={open ? 'border-mineral/30 bg-mineral-dim text-mineral hover:bg-mineral/20' : ''}
			>
				<MessageSquare size={13} strokeWidth={1.75} aria-hidden="true" />
			</Button>
		</Tooltip>
	)
}
