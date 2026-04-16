import {
	categoryOf,
	fmtRelativeTime,
	ledgerDetail,
	ledgerTitle,
	ledgerTone,
	payloadOf,
	visualOf
} from '@/lib/domain'
import type { AgentSession, AttentionRequest, RunEvent } from '@/types'

interface LedgerRowProps {
	event: RunEvent
	sessionById: Map<string, AgentSession>
	attentionById: Map<string, AttentionRequest>
	connect: boolean
}

export function LedgerRow({ event, sessionById, attentionById, connect }: LedgerRowProps) {
	const visual = visualOf(event.kind)
	const category = categoryOf(event.kind)
	const payload = payloadOf(event)
	const title = ledgerTitle(event, payload)
	const detail = ledgerDetail(event, payload, sessionById, attentionById)

	return (
		<li className="relative">
			{connect ? (
				<span
					className="absolute top-5 -bottom-1.5 -left-4 w-px -translate-x-1/2 bg-edge/60"
					aria-hidden
				/>
			) : null}
			<span
				className={`absolute top-2 -left-4 inline-block h-2 w-2 -translate-x-1/2 rounded-full ${visual.dot} ring-2 ${visual.ring} ring-offset-1 ring-offset-carbon`}
				aria-hidden
			/>
			<div className="flex items-baseline gap-2 py-1">
				<span className="font-data text-[10px] tracking-wider text-dim uppercase">
					{visual.label}
				</span>
				<span className={`text-[13px] leading-snug ${ledgerTone(event.level, category)}`}>
					{title}
				</span>
				<span className="font-data ml-auto shrink-0 text-[10px] text-dim">
					{fmtRelativeTime(event.ts)}
				</span>
			</div>
			{detail ? <div className="pb-1 text-[11.5px] text-silver">{detail}</div> : null}
		</li>
	)
}
