import { ChatPanel } from '@/components/chat/ChatPanel'
import { SideDrawer } from '@/components/ui/side-drawer'
import { useWorkspaceChatStore } from '@/stores/workspaceChat'
import type { ConversationSubject } from '@/types'

interface ChatDrawerProps {
	subject: ConversationSubject
}

export function ChatDrawer({ subject }: ChatDrawerProps) {
	const open = useWorkspaceChatStore((s) => s.open)
	const closeChat = useWorkspaceChatStore((s) => s.closeChat)

	return (
		<SideDrawer open={open} onClose={closeChat} title="Chat" closeAriaLabel="Close chat">
			<div className="min-h-0 flex-1 p-3">
				<ChatPanel subject={subject} />
			</div>
		</SideDrawer>
	)
}
