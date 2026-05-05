import { useEffect, useRef, useState } from 'react'

import { AgentPicker, type AgentPickerOption } from '@/components/chat/AgentPicker'
import { ChatComposer } from '@/components/chat/ChatComposer'
import { ModelPicker } from '@/components/chat/ModelPicker'
import { ModePicker } from '@/components/chat/ModePicker'
import { TurnView } from '@/components/chat/TurnView'
import { useConversation } from '@/hooks/useConversation'
import type { AgentProvider, ChatPermissionMode, ConversationSubject } from '@/types'

interface ChatPanelProps {
	subject: ConversationSubject
}

// SUP-100 V1 only ships a static catalogue. Once a runtime registry exposes
// agents per provider we'll replace this with a hook (and the component
// signature stays unchanged because the picker takes options as a prop).
const DEFAULT_OPTIONS: AgentPickerOption[] = [
	{ agentId: 'planner', provider: 'claude', label: 'Planner — claude' },
	{ agentId: 'coder', provider: 'claude', label: 'Coder — claude' },
	{ agentId: 'planner', provider: 'codex', label: 'Planner — codex' },
	{ agentId: 'coder', provider: 'codex', label: 'Coder — codex' }
]

export function ChatPanel({ subject }: ChatPanelProps) {
	const [picked, setPicked] = useState<{ agentId: string; provider: AgentProvider } | null>(null)
	// Mode + model live in component state (sticky between sends, reset
	// when the panel unmounts). Defaults match the Claude Code terminal:
	// "Edit automatically" + provider default model.
	const [mode, setMode] = useState<ChatPermissionMode>('edit_automatically')
	const [model, setModel] = useState<string | null>(null)

	const conversation = useConversation({
		subject,
		agentId: picked?.agentId ?? '',
		provider: picked?.provider ?? 'claude',
		enabled: picked !== null
	})

	const eventsByTurn = conversation.detail?.events_by_turn ?? {}
	const isStreaming = conversation.activeTurnId !== null

	// Auto-scroll the transcript to the latest content. We anchor on:
	//  - the active turn id (new turn appended)
	//  - turns.length (a refetch added a turn)
	//  - the active turn's last persisted event count (incremental tokens
	//    while streaming, so the scroll follows the response as it grows).
	const scrollRef = useRef<HTMLDivElement>(null)
	const activeEventCount = conversation.activeTurnId
		? (eventsByTurn[conversation.activeTurnId]?.length ?? 0)
		: 0
	useEffect(() => {
		const el = scrollRef.current
		if (!el) return
		el.scrollTop = el.scrollHeight
	}, [conversation.turns.length, conversation.activeTurnId, activeEventCount])

	const handleSubmit = (text: string) => conversation.send(text, { mode, model: model ?? undefined })

	return (
		<section className="space-y-4">
			<header className="flex flex-wrap items-center justify-between gap-3">
				<h2 className="font-data text-[14px] font-semibold text-fog">Chat</h2>
				<div className="flex flex-wrap items-center gap-3">
					<AgentPicker
						options={DEFAULT_OPTIONS}
						value={picked}
						onChange={setPicked}
						disabled={isStreaming}
					/>
					{picked ? (
						<>
							<ModePicker value={mode} onChange={setMode} disabled={isStreaming} />
							<ModelPicker
								provider={picked.provider}
								value={model}
								onChange={setModel}
								disabled={isStreaming}
							/>
						</>
					) : null}
				</div>
			</header>

			{picked === null ? (
				<p className="font-data text-[11px] text-dim">
					Select an agent to start chatting. The transcript and the underlying provider session are
					persisted per agent.
				</p>
			) : conversation.error ? (
				<p className="font-data rounded bg-oxide-dim p-2 text-[11px] text-oxide">
					{conversation.error}
				</p>
			) : (
				<>
					<div
						ref={scrollRef}
						className="bg-carbon-dim/40 max-h-120 space-y-4 overflow-y-auto rounded-md border border-edge p-3"
					>
						{conversation.turns.length === 0 && !conversation.loading ? (
							<p className="font-data text-[11px] text-dim">
								No turns yet. Send a message to begin.
							</p>
						) : null}
						{conversation.turns.map((turn) => (
							<TurnView
								key={turn.id}
								turn={turn}
								events={eventsByTurn[turn.id] ?? []}
								live={turn.id === conversation.activeTurnId}
								onTerminal={
									turn.id === conversation.activeTurnId
										? conversation.syncDetail
										: undefined
								}
							/>
						))}
					</div>

					<ChatComposer
						onSubmit={handleSubmit}
						onCancelActiveTurn={conversation.cancelActiveTurn}
						disabled={conversation.sending || conversation.cancelling}
						streaming={isStreaming}
						error={conversation.sendError}
					/>
				</>
			)}
		</section>
	)
}
