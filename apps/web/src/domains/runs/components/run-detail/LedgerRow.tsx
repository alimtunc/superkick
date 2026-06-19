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
}

export function LedgerRow({ event, sessionById, attentionById }: LedgerRowProps) {
	const visual = visualOf(event.kind)
	const category = categoryOf(event.kind)
	const payload = payloadOf(event)
	const title = ledgerTitle(event, payload)
	const detail = ledgerDetail(event, payload, sessionById, attentionById)

	return (
		<li className="feeditem">
			<span className="feeditem__node">
				<span className="node-glyph">
					<span className={`size-1.5 rounded-full ${visual.dot}`} aria-hidden />
				</span>
			</span>
			<div className="sysevent">
				<span className="font-data text-[10px] tracking-wider text-fg-dim uppercase">
					{visual.label}
				</span>
				<strong className={ledgerTone(event.level, category)}>{title}</strong>
				<span className="ts ml-auto shrink-0">{fmtRelativeTime(event.ts)}</span>
			</div>
			{detail ? <div className="pb-1 text-[11.5px] text-fg-muted">{detail}</div> : null}
		</li>
	)
}
