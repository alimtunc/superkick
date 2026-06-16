import { useState } from 'react'

import { Icon, Pill, type PillTone } from '@/components/primitives'
import { protocolRowView } from '@/domains/runs/components/run-tabs/protocolActivityView'
import { fmtRelativeTime } from '@/lib/domain'
import type { ProtocolEventEnvelope, RunEvent } from '@/types'

interface ProtocolActivityRowProps {
	event: RunEvent
	envelope: ProtocolEventEnvelope
}

const STATUS_TONE: Record<NonNullable<ReturnType<typeof protocolRowView>['statusTone']>, PillTone> = {
	success: 'success',
	danger: 'danger',
	warn: 'warn',
	info: 'info',
	neutral: 'neutral'
}

export function ProtocolActivityRow({ event, envelope }: ProtocolActivityRowProps) {
	const view = protocolRowView(envelope)
	const [expanded, setExpanded] = useState(false)
	const showFull = expanded || !view.collapsible
	const detailText = showFull ? view.detail : view.preview

	return (
		<li className="feeditem">
			<span className="feeditem__node">
				<span className={`node-glyph ${view.tone}`}>
					<Icon name={view.icon} size={13} className="ic" />
				</span>
			</span>
			<div className="flex min-w-0 items-center gap-2">
				<span className="truncate text-[13px] font-medium text-fg">{view.title}</span>
				{view.statusLabel && view.statusTone ? (
					<Pill mono size="xs" tone={STATUS_TONE[view.statusTone]}>
						{view.statusLabel}
					</Pill>
				) : null}
				<span className="font-data ml-auto shrink-0 text-[10.5px] text-fg-dim">
					{fmtRelativeTime(event.ts)}
				</span>
			</div>
			{detailText ? (
				<p className="mt-1 font-mono text-[11.5px] whitespace-pre-wrap text-fg-muted">{detailText}</p>
			) : null}
			{view.collapsible ? (
				<button
					type="button"
					onClick={() => setExpanded((value) => !value)}
					className="mt-1 text-[11px] text-fg-dim hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
					aria-expanded={expanded}
				>
					{expanded ? 'Show less' : 'Show more'}
				</button>
			) : null}
		</li>
	)
}
