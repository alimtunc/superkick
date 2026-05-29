import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ChatComposer } from '@/components/chat/ChatComposer'
import { TurnView } from '@/components/chat/TurnView'
import { EmptyState } from '@/components/ui/state-empty'
import { useConversationView } from '@/hooks/useConversationView'
import { subjectKey } from '@/lib/conversations'
import { queryKeys } from '@/lib/queryKeys'
import type { ChatPermissionMode, ConversationSubject } from '@/types'

interface ChatConversationViewProps {
	conversationId: string
	subject: ConversationSubject
	mode: ChatPermissionMode
	model: string | null
	onModeChange: (next: ChatPermissionMode) => void
	onModelChange: (next: string | null) => void
	/** First-turn text handed off from `NewChatLauncher` once it has created
	 * the conversation row. The view dispatches it through the standard
	 * turn-create mutation on mount — so transient failures surface in the
	 * composer's error pill and a retry stays on the same conversation. */
	pendingFirstMessage?: string | null
	onPendingFirstMessageConsumed?: () => void
}

export function ChatConversationView({
	conversationId,
	subject,
	mode,
	model,
	onModeChange,
	onModelChange,
	pendingFirstMessage,
	onPendingFirstMessageConsumed
}: ChatConversationViewProps) {
	const key = subjectKey(subject)
	const listKey = useMemo(() => queryKeys.conversations.list(key), [key])
	const view = useConversationView({ conversationId, listKey })

	const eventsByTurn = view.detail?.events_by_turn ?? {}
	const isStreaming = view.activeTurnId !== null

	// Auto-scroll the transcript so the latest content stays in view, both
	// when a new turn appends and as live tokens arrive on an active turn.
	// `liveTick` bumps once per live SSE envelope (see `onLiveEvent` below)
	// so the effect re-fires mid-stream — `view.detail.events_by_turn` only
	// updates on terminal refetch and would otherwise leave the scroll
	// position frozen while tokens are still flowing.
	const scrollRef = useRef<HTMLDivElement>(null)
	const [liveTick, setLiveTick] = useState(0)
	const handleLiveEvent = useCallback(() => setLiveTick((t) => t + 1), [])
	useEffect(() => {
		const el = scrollRef.current
		if (!el) return
		el.scrollTop = el.scrollHeight
	}, [view.turns.length, view.activeTurnId, liveTick])

	// Reset the live tick when the active turn changes so a stale counter
	// from a previous turn cannot re-trigger the scroll effect after a new
	// turn appends but before its first live envelope lands.
	useEffect(() => {
		setLiveTick(0)
	}, [view.activeTurnId])

	// Latest mode / model snapshot for the pending-first-message effect.
	// Read via ref so the effect only fires on `pendingFirstMessage` changes
	// (not every keystroke that updates mode/model in the parent).
	const sendOptionsRef = useRef({ mode, model })
	useEffect(() => {
		sendOptionsRef.current = { mode, model }
	}, [mode, model])

	useEffect(() => {
		if (!pendingFirstMessage) return
		const { mode: m, model: md } = sendOptionsRef.current
		void view.send(pendingFirstMessage, { mode: m, model: md ?? undefined }).catch(() => {
			// surfaces via view.sendError; the composer's error pill prompts a retry
		})
		onPendingFirstMessageConsumed?.()
	}, [pendingFirstMessage, view, onPendingFirstMessageConsumed])

	const handleSubmit = (text: string) => view.send(text, { mode, model: model ?? undefined })

	const provider = view.conversation?.provider ?? null
	const agentLabel = view.conversation
		? `${view.conversation.agent_id} — ${view.conversation.provider}`
		: '…'

	return (
		<div className="flex h-full min-h-0 flex-col">
			<header className="flex items-center justify-between gap-3 border-b border-border p-3">
				<span className="font-data text-[12px] text-fg">{agentLabel}</span>
			</header>

			{view.error ? (
				<p className="font-data m-3 rounded bg-danger-soft p-2 text-[11px] text-danger">
					{view.error}
				</p>
			) : null}

			<div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-3">
				{view.turns.length === 0 && !view.loading ? (
					<EmptyState
						density="compact"
						title="No turns yet"
						description="Send a message to begin."
					/>
				) : null}
				{view.turns.map((turn) => (
					<TurnView
						key={turn.id}
						turn={turn}
						events={eventsByTurn[turn.id] ?? []}
						live={turn.id === view.activeTurnId}
						onTerminal={turn.id === view.activeTurnId ? view.syncDetail : undefined}
						onLiveEvent={turn.id === view.activeTurnId ? handleLiveEvent : undefined}
					/>
				))}
			</div>

			<div className="border-t border-border p-3">
				<ChatComposer
					onSubmit={handleSubmit}
					onCancelActiveTurn={view.cancelActiveTurn}
					disabled={view.sending || view.cancelling}
					streaming={isStreaming}
					error={view.sendError}
					mode={mode}
					model={model}
					provider={provider}
					onModeChange={onModeChange}
					onModelChange={onModelChange}
				/>
			</div>
		</div>
	)
}
