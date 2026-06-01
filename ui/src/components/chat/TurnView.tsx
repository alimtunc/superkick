import { ToolCallBlock } from '@/components/chat/ToolCallBlock'
import { formatUsage, statusTone } from '@/components/chat/turnView.helpers'
import { Disclosure } from '@/components/ui/disclosure'
import { Pill } from '@/components/ui/pill'
import { useTurnStream } from '@/hooks/useTurnStream'
import type { Turn, TurnEvent } from '@/types'

interface TurnViewProps {
	turn: Turn
	events: TurnEvent[]
	live: boolean
	/** Called once the live stream emits a terminal event. Parent uses it
	 * to refetch the persisted conversation detail so the badge / usage
	 * counts stop reflecting the in-flight state. */
	onTerminal?: () => void
	/** Called for each live envelope on the active turn — used by the
	 * transcript to keep the latest tokens scrolled into view. */
	onLiveEvent?: () => void
}

function ThinkingHeader({ chars }: { chars: number }) {
	return (
		<>
			<span className="text-success uppercase">thinking</span>
			<span className="ml-auto text-[10px] text-fg-dim">{chars} chars</span>
		</>
	)
}

function thinkingHeader(chars: number) {
	return () => <ThinkingHeader chars={chars} />
}

export function TurnView({ turn, events, live, onTerminal, onLiveEvent }: TurnViewProps) {
	const stream = useTurnStream({
		turnId: turn.id,
		historicalEvents: events,
		live: live && (turn.status === 'pending' || turn.status === 'streaming'),
		onTerminal,
		onLiveEvent
	})
	const usage = formatUsage(turn)

	return (
		<article className="space-y-3">
			<div className="font-data rounded-md border border-border bg-surface p-3 text-[12px] text-fg">
				<div className="mb-1 text-[10px] text-fg-dim uppercase">You</div>
				<p className="whitespace-pre-wrap">{turn.user_text}</p>
			</div>

			<div className="space-y-2">
				<div className="flex items-center gap-2">
					<span className="text-[10px] text-fg-dim uppercase">Agent</span>
					<Pill
						tone={statusTone(turn.status)}
						mono
						className="h-auto rounded px-1.5 py-0.5 text-[10px]"
					>
						{turn.status}
					</Pill>
					{usage ? (
						<span className="font-data text-[10px] text-fg-dim" title={usage.tooltip}>
							{usage.label}
						</span>
					) : null}
				</div>

				{stream.text.length > 0 ? (
					<div className="font-data rounded-md border border-border bg-surface p-3 text-[12px] whitespace-pre-wrap text-fg">
						{stream.text}
					</div>
				) : null}

				{stream.toolCalls.length > 0 ? (
					<div className="space-y-1.5">
						{stream.toolCalls.map((call) => (
							<ToolCallBlock key={call.call_id} call={call} />
						))}
					</div>
				) : null}

				{stream.thinking.length > 0 ? (
					<Disclosure header={thinkingHeader(stream.thinking.length)}>
						<pre className="wrap-break-word whitespace-pre-wrap text-fg-dim">
							{stream.thinking}
						</pre>
					</Disclosure>
				) : null}

				{turn.error ? (
					<div className="font-data rounded-md border border-danger/30 bg-danger-soft p-2 text-[11px] text-danger">
						<span className="mr-1 uppercase">{turn.error.code}</span>
						{turn.error.message}
					</div>
				) : null}
				{turn.cancel_reason ? (
					<div className="font-data text-[11px] text-fg-dim">cancelled: {turn.cancel_reason}</div>
				) : null}
			</div>
		</article>
	)
}
