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
			return 'bg-success-soft text-success'
		case 'failed':
			return 'bg-danger-soft text-danger'
		case 'cancelled':
			return 'bg-border bg-clip-padding text-fg-dim'
		case 'streaming':
			return 'bg-info-soft text-info'
		default:
			return 'bg-border text-fg-dim'
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
			<div className="font-data rounded-md border border-border bg-surface p-3 text-[12px] text-fg">
				<div className="mb-1 text-[10px] text-fg-dim uppercase">You</div>
				<p className="whitespace-pre-wrap">{turn.user_text}</p>
			</div>

			<div className="space-y-2">
				<div className="flex items-center gap-2">
					<span className="text-[10px] text-fg-dim uppercase">Agent</span>
					<span
						className={`font-data rounded px-1.5 py-0.5 text-[10px] ${statusBadgeClass(turn.status)}`}
					>
						{turn.status}
					</span>
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
					<Disclosure
						header={() => (
							<>
								<span className="text-success uppercase">thinking</span>
								<span className="ml-auto text-[10px] text-fg-dim">
									{stream.thinking.length} chars
								</span>
							</>
						)}
					>
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
