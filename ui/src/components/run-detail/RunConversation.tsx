import { RunChat } from '@/components/run-detail/RunChat'
import { RunComposer } from '@/components/run-detail/RunComposer'
import { Pill } from '@/components/ui/pill'
import { EmptyState } from '@/components/ui/state-empty'
import { categoryOf, fmtRelativeTime, isLedgerEvent, ledgerTitle, payloadOf } from '@/lib/domain'
import type { AttentionRequest, EventKind, RunEvent } from '@/types'
import { MessageSquare } from 'lucide-react'

interface RunConversationProps {
	events: RunEvent[]
	attentionRequests: AttentionRequest[]
	disabled?: boolean
}

function roleFor(kind: EventKind): 'user' | 'agent' | null {
	if (kind === 'operator_input' || kind === 'attention_replied') return 'user'
	if (categoryOf(kind) === 'operator') return null
	return 'agent'
}

function isPlainStringRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

function bodyFor(event: RunEvent): string {
	const payload = payloadOf(event)
	if (event.kind === 'operator_input' && isPlainStringRecord(payload)) {
		const text = payload['text'] ?? payload['message']
		if (typeof text === 'string' && text.length > 0) return text
	}
	if (event.kind === 'attention_replied' && isPlainStringRecord(payload)) {
		const reply = payload['reply'] ?? payload['answer']
		if (typeof reply === 'string' && reply.length > 0) return reply
	}
	return ledgerTitle(event, payload) || event.message
}

function ChatBubble({ event }: { event: RunEvent }) {
	const from = roleFor(event.kind)
	if (!from) return null
	const who = from === 'user' ? 'You' : 'Agent'
	const tone = from === 'agent' && event.level === 'error' ? 'danger' : 'neutral'
	return (
		<RunChat
			from={from}
			who={who}
			time={fmtRelativeTime(event.ts)}
			badge={
				from === 'agent' ? (
					<Pill mono size="xs" tone={tone === 'danger' ? 'danger' : 'neutral'}>
						{event.kind.replace(/_/g, ' ')}
					</Pill>
				) : null
			}
		>
			{bodyFor(event)}
		</RunChat>
	)
}

function PendingAttentionBubble({ request }: { request: AttentionRequest }) {
	return (
		<RunChat
			from="agent"
			who="Agent"
			time={fmtRelativeTime(request.created_at)}
			badge={
				<Pill mono size="xs" tone="warn">
					needs decision
				</Pill>
			}
		>
			<div className="space-y-1">
				<div className="text-fg">{request.title}</div>
				{request.body ? (
					<pre className="font-sans whitespace-pre-wrap text-fg-muted">{request.body}</pre>
				) : null}
			</div>
		</RunChat>
	)
}

export function RunConversation({ events, attentionRequests, disabled }: RunConversationProps) {
	const ledgerEvents = events.filter(isLedgerEvent)
	const pendingAttentions = attentionRequests.filter((r) => r.status === 'pending')
	const hasContent = ledgerEvents.length > 0 || pendingAttentions.length > 0

	return (
		<div className="flex h-full min-h-0 flex-1 flex-col">
			<div className="min-h-0 flex-1 overflow-y-auto">
				{hasContent ? (
					<>
						{ledgerEvents.map((event) =>
							roleFor(event.kind) ? <ChatBubble key={event.id} event={event} /> : null
						)}
						{pendingAttentions.map((request) => (
							<PendingAttentionBubble key={request.id} request={request} />
						))}
					</>
				) : (
					<div className="px-6 py-10">
						<EmptyState
							icon={MessageSquare}
							title="No turns yet"
							description="Conversation will appear here as the run progresses."
						/>
					</div>
				)}
			</div>
			<div className="flex-none border-t border-border bg-surface px-6 py-3">
				<RunComposer disabled={disabled ?? false} />
			</div>
		</div>
	)
}
