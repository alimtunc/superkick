import { useEffect, useMemo, useRef, useState } from 'react'

import { fmtRelativeTime } from '@/lib/domain'
import type { EventKind, EventLevel, RunEvent } from '@/types'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface EventsPanelProps {
	events: RunEvent[]
}

const NARRATIVE_KINDS = new Set<EventKind>([
	'state_change',
	'step_started',
	'step_completed',
	'step_failed',
	'interrupt_created',
	'interrupt_resolved',
	'review_completed',
	'attention_requested',
	'attention_replied',
	'attention_cancelled',
	'error',
	'external_attach'
])

const kindDot: Record<string, string> = {
	state_change: 'bg-cyan',
	step_started: 'bg-cyan',
	step_completed: 'bg-mineral',
	step_failed: 'bg-oxide',
	interrupt_created: 'bg-gold',
	interrupt_resolved: 'bg-mineral',
	review_completed: 'bg-violet',
	attention_requested: 'bg-gold',
	attention_replied: 'bg-mineral',
	attention_cancelled: 'bg-dim',
	error: 'bg-oxide',
	external_attach: 'bg-silver'
}

const levelColor: Record<EventLevel, string> = {
	debug: 'text-dim',
	info: 'text-fog/90',
	warn: 'text-gold',
	error: 'text-oxide'
}

export function EventsPanel({ events }: EventsPanelProps) {
	const [expanded, setExpanded] = useState(false)
	const bottomRef = useRef<HTMLDivElement>(null)

	const narrative = useMemo(() => events.filter((event) => NARRATIVE_KINDS.has(event.kind)), [events])

	useEffect(() => {
		if (expanded) {
			bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
		}
	}, [narrative.length, expanded])

	const latest = narrative[narrative.length - 1]

	return (
		<div className="rounded-lg border border-edge bg-carbon">
			<button
				type="button"
				onClick={() => setExpanded((prev) => !prev)}
				className="flex w-full items-center gap-2 px-3 py-2 text-left"
			>
				{expanded ? (
					<ChevronDown className="h-3 w-3 text-dim" />
				) : (
					<ChevronRight className="h-3 w-3 text-dim" />
				)}
				<span className="font-data text-[11px] tracking-wider text-silver uppercase">
					Recent activity
				</span>
				<span className="font-data text-[11px] text-dim">({narrative.length})</span>
				{!expanded && latest ? (
					<span className="font-data ml-auto truncate text-[11px] text-dim">
						{latest.message} · {fmtRelativeTime(latest.ts)}
					</span>
				) : null}
			</button>

			{expanded ? (
				<div className="max-h-64 overflow-y-auto border-t border-edge px-3 py-2">
					{narrative.length === 0 ? (
						<p className="font-data text-[11px] text-dim">No activity yet.</p>
					) : null}
					{narrative.map((event) => (
						<div key={event.id} className="flex items-start gap-2 py-1 text-[12px]">
							<span
								className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${kindDot[event.kind] ?? 'bg-dim'}`}
							/>
							<span className={`flex-1 leading-snug ${levelColor[event.level]}`}>
								{event.message}
							</span>
							<span className="font-data shrink-0 text-[10px] text-dim">
								{fmtRelativeTime(event.ts)}
							</span>
						</div>
					))}
					<div ref={bottomRef} />
				</div>
			) : null}
		</div>
	)
}
