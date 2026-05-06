import type { ReactNode } from 'react'

import { ConversationStateBadge } from '@/components/chat/ConversationStateBadge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/state-empty'
import { LoadingState } from '@/components/ui/state-loading'
import { useNow } from '@/hooks/useNow'
import { deriveConversationUxState } from '@/lib/domain'
import { cn } from '@/lib/utils'
import type { ConversationSummary, ConversationUxState } from '@/types'
import { MessagesSquare, Plus } from 'lucide-react'

interface ChatSidebarProps {
	conversations: ConversationSummary[]
	selectedId: string | null
	loading: boolean
	onSelect: (id: string) => void
	onNewChat: () => void
	/**
	 * Optional precomputed state per conversation id. ChatPanel populates
	 * this for run subjects (run + active takeovers); when absent (or a
	 * given id is missing) the sidebar falls back to deriving from the
	 * `ConversationSummary` alone.
	 */
	statesById?: Record<string, ConversationUxState>
}

const MAX_TITLE_CHARS = 48

function truncate(text: string, max = MAX_TITLE_CHARS): string {
	const trimmed = text.replaceAll(/\s+/g, ' ').trim()
	if (trimmed.length <= max) return trimmed
	return `${trimmed.slice(0, max - 1)}…`
}

function relativeTimeLabel(now: number, stamp: string): string {
	const t = Date.parse(stamp)
	if (Number.isNaN(t)) return ''
	const delta = Math.max(0, now - t)
	const sec = Math.floor(delta / 1000)
	if (sec < 60) return `${sec}s`
	const min = Math.floor(sec / 60)
	if (min < 60) return `${min}m`
	const hr = Math.floor(min / 60)
	if (hr < 24) return `${hr}h`
	const day = Math.floor(hr / 24)
	if (day < 7) return `${day}d`
	const weeks = Math.floor(day / 7)
	if (weeks < 5) return `${weeks}w`
	return new Date(t).toISOString().slice(0, 10)
}

function conversationTimestamp(c: ConversationSummary): string {
	return c.last_turn_at ?? c.updated_at ?? c.created_at
}

function conversationTitle(c: ConversationSummary): string {
	const opener = c.first_user_text?.trim()
	return opener && opener.length > 0 ? truncate(opener) : 'Untitled chat'
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

	function rowState(c: ConversationSummary): ConversationUxState {
		const precomputed = statesById?.[c.id]
		if (precomputed) return precomputed
		return deriveConversationUxState({ conversation: c })
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
			<ul className="divide-y divide-edge">
				{conversations.map((c) => (
					<li key={c.id}>
						<button
							type="button"
							onClick={() => onSelect(c.id)}
							className={cn(
								'flex w-full flex-col gap-1 px-3 py-2 text-left transition-colors hover:bg-carbon',
								selectedId === c.id ? 'bg-carbon' : 'bg-transparent'
							)}
						>
							<div className="flex items-start justify-between gap-2">
								<span className="font-data line-clamp-2 text-[11px] text-fog">
									{conversationTitle(c)}
								</span>
								<span className="font-data shrink-0 text-[10px] text-dim">
									{relativeTimeLabel(now, conversationTimestamp(c))}
								</span>
							</div>
							<div className="flex items-center justify-between gap-2">
								<ConversationStateBadge state={rowState(c)} />
								<span className="font-data text-[10px] text-dim capitalize">
									{c.provider}
								</span>
							</div>
						</button>
					</li>
				))}
			</ul>
		)
	}

	return (
		<aside className="flex w-60 shrink-0 flex-col border-r border-edge">
			<div className="bg-carbon-dim sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-edge p-2">
				<span className="font-data text-[11px] tracking-wider text-dim uppercase">Conversations</span>
				<Button variant="outline" size="xs" onClick={onNewChat} className="font-data">
					<Plus aria-hidden="true" />
					New
				</Button>
			</div>

			<div className="flex-1 overflow-y-auto">{listBody()}</div>
		</aside>
	)
}
