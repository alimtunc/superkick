import type { ReactNode } from 'react'

import { Button, EmptyState, LoadingState } from '@/components/primitives'
import { ConversationStateBadge } from '@/domains/chat/components/ConversationStateBadge'
import { useNow } from '@/hooks/useNow'
import { deriveConversationUxState, fmtRelativeShort } from '@/lib/domain'
import { truncate } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { ConversationSummary, ConversationUxState } from '@/types'
import { MessagesSquare, Plus } from 'lucide-react'

interface ChatSidebarProps {
	conversations: ConversationSummary[]
	selectedId: string | null
	loading: boolean
	onSelect: (id: string) => void
	onNewChat: () => void
	statesById?: Record<string, ConversationUxState>
}

const MAX_TITLE_CHARS = 48

function truncateTitle(text: string, max = MAX_TITLE_CHARS): string {
	return truncate(text.replaceAll(/\s+/g, ' ').trim(), max)
}

function conversationTimestamp(conversation: ConversationSummary): string {
	return conversation.last_turn_at ?? conversation.updated_at ?? conversation.created_at
}

function conversationTitle(conversation: ConversationSummary): string {
	const opener = conversation.first_user_text?.trim()
	return opener && opener.length > 0 ? truncateTitle(opener) : 'Untitled chat'
}

export function ChatSidebar({
	conversations,
	selectedId,
	loading,
	onSelect,
	onNewChat,
	statesById
}: ChatSidebarProps) {
	const now = useNow()

	function rowState(conversation: ConversationSummary): ConversationUxState {
		const precomputed = statesById?.[conversation.id]
		if (precomputed) return precomputed
		return deriveConversationUxState({ conversation })
	}

	function listBody(): ReactNode {
		if (loading) return <LoadingState density="compact" rows={3} className="m-2" />
		if (conversations.length === 0) {
			return (
				<EmptyState
					density="compact"
					icon={MessagesSquare}
					title="No conversations yet"
					className="m-2"
				/>
			)
		}
		return (
			<ul className="divide-y divide-border">
				{conversations.map((conversation) => (
					<li key={conversation.id}>
						<button
							type="button"
							onClick={() => onSelect(conversation.id)}
							className={cn(
								'flex w-full flex-col gap-1 px-3 py-2 text-left transition-colors hover:bg-surface',
								selectedId === conversation.id ? 'bg-surface' : 'bg-transparent'
							)}
						>
							<div className="flex items-start justify-between gap-2">
								<span className="font-data line-clamp-2 text-[11px] text-fg">
									{conversationTitle(conversation)}
								</span>
								<span className="font-data shrink-0 text-[10px] text-fg-dim">
									{fmtRelativeShort(conversationTimestamp(conversation), now)}
								</span>
							</div>
							<div className="flex items-center justify-between gap-2">
								<ConversationStateBadge state={rowState(conversation)} />
								<span className="font-data text-[10px] text-fg-dim capitalize">
									{conversation.provider}
								</span>
							</div>
						</button>
					</li>
				))}
			</ul>
		)
	}

	return (
		<aside className="flex w-60 shrink-0 flex-col border-r border-border">
			<div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-surface p-2">
				<span className="font-data text-[11px] tracking-wider text-fg-dim uppercase">
					Conversations
				</span>
				<Button variant="outline" size="xs" onClick={onNewChat} className="font-data">
					<Plus aria-hidden="true" />
					New
				</Button>
			</div>

			<div className="flex-1 overflow-y-auto">{listBody()}</div>
		</aside>
	)
}
