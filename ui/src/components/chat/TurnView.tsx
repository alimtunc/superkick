import { ToolCallBlock } from '@/components/chat/ToolCallBlock'
import { Disclosure } from '@/components/ui/disclosure'
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

interface UsageDisplay {
	label: string
	tooltip: string
}

function formatUsage(turn: Turn): UsageDisplay | null {
	// Match the Claude Code terminal: a single "N tokens" headline (the
	// output count, which is what the operator paid attention bandwidth on)
	// and the input / cache breakdown in the tooltip for the curious.
	const u = turn.usage
	if (!u) return null
	const out = u.output_tokens ?? 0
	const inp = u.input_tokens ?? 0
	const cache = u.cache_read_tokens ?? 0
	if (out === 0 && inp === 0 && cache === 0) return null
	const tooltipParts: string[] = []
	if (inp > 0) tooltipParts.push(`input ${inp}`)
	if (out > 0) tooltipParts.push(`output ${out}`)
	if (cache > 0) tooltipParts.push(`cache ${cache}`)
	return {
		label: `${out} tokens`,
		tooltip: tooltipParts.join(' · ')
	}
}

function statusBadgeClass(status: Turn['status']): string {
	switch (status) {
		case 'completed':
			return 'bg-mineral-dim text-mineral'
		case 'failed':
			return 'bg-oxide-dim text-oxide'
		case 'cancelled':
			return 'bg-edge bg-clip-padding text-dim'
		case 'streaming':
			return 'bg-cyan-dim text-cyan'
		default:
			return 'bg-edge text-dim'
	}
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
			<div className="font-data rounded-md border border-edge bg-carbon p-3 text-[12px] text-fog">
				<div className="mb-1 text-[10px] text-dim uppercase">You</div>
				<p className="whitespace-pre-wrap">{turn.user_text}</p>
			</div>

			<div className="space-y-2">
				<div className="flex items-center gap-2">
					<span className="text-[10px] text-dim uppercase">Agent</span>
					<span
						className={`font-data rounded px-1.5 py-0.5 text-[10px] ${statusBadgeClass(turn.status)}`}
					>
						{turn.status}
					</span>
					{usage ? (
						<span className="font-data text-[10px] text-dim" title={usage.tooltip}>
							{usage.label}
						</span>
					) : null}
				</div>

				{stream.text.length > 0 ? (
					<div className="font-data bg-carbon-dim rounded-md border border-edge p-3 text-[12px] whitespace-pre-wrap text-fog">
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
					<Disclosure
						header={() => (
							<>
								<span className="text-mineral uppercase">thinking</span>
								<span className="ml-auto text-[10px] text-dim">
									{stream.thinking.length} chars
								</span>
							</>
						)}
					>
						<pre className="wrap-break-word whitespace-pre-wrap text-dim">{stream.thinking}</pre>
					</Disclosure>
				) : null}

				{turn.error ? (
					<div className="font-data rounded-md border border-oxide/30 bg-oxide-dim p-2 text-[11px] text-oxide">
						<span className="mr-1 uppercase">{turn.error.code}</span>
						{turn.error.message}
					</div>
				) : null}
				{turn.cancel_reason ? (
					<div className="font-data text-[11px] text-dim">cancelled: {turn.cancel_reason}</div>
				) : null}
			</div>
		</article>
	)
}
