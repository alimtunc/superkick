import { ChatPanel } from '@/components/chat/ChatPanel'
import { useWorkspaceChatStore } from '@/stores/workspaceChat'
import type { ConversationSubject } from '@/types'
import { Dialog } from '@base-ui/react/dialog'
import { X } from 'lucide-react'

interface ChatDrawerProps {
	subject: ConversationSubject
}

export function ChatDrawer({ subject }: ChatDrawerProps) {
	const open = useWorkspaceChatStore((s) => s.open)
	const closeChat = useWorkspaceChatStore((s) => s.closeChat)

	return (
		<Dialog.Root open={open} onOpenChange={(value) => (value ? null : closeChat())}>
			<Dialog.Portal>
				<Dialog.Backdrop className="fixed inset-0 z-40 bg-carbon/60 backdrop-blur-sm transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
				<Dialog.Popup className="fixed top-0 right-0 z-50 flex h-dvh w-1/2 min-w-md flex-col border-l border-edge bg-carbon shadow-2xl transition-transform duration-200 outline-none data-ending-style:translate-x-full data-starting-style:translate-x-full">
					<header className="flex h-12 shrink-0 items-center justify-between border-b border-edge px-4">
						<Dialog.Title className="font-data text-[11px] font-medium tracking-widest text-silver uppercase">
							Chat
						</Dialog.Title>
						<Dialog.Close
							className="inline-flex h-6 w-6 items-center justify-center rounded-md text-ash transition-colors hover:bg-slate-deep/40 hover:text-silver focus-visible:ring-2 focus-visible:ring-mineral/40 focus-visible:outline-none"
							aria-label="Close chat"
						>
							<X size={14} strokeWidth={1.75} aria-hidden="true" />
						</Dialog.Close>
					</header>
					<div className="min-h-0 flex-1 p-3">
						<ChatPanel subject={subject} />
					</div>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	)
}
