import { useEffect, useMemo, useRef, useState } from 'react'

import type { EventLevel, RunEvent } from '@/types'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface EventsPanelProps {
	events: RunEvent[]
}

const STRUCTURED_KINDS = new Set([
	'state_change',
	'step_started',
	'step_completed',
	'step_failed',
	'interrupt_created',
	'interrupt_resolved',
	'review_completed',
	'error',
	'external_attach'
])

const levelColor: Record<EventLevel, string> = {
	debug: 'text-dim',
	info: 'text-silver',
	warn: 'text-gold',
	error: 'text-oxide'
}

export function EventsPanel({ events }: EventsPanelProps) {
	const [expanded, setExpanded] = useState(false)
	const bottomRef = useRef<HTMLDivElement>(null)

	const structured = useMemo(() => events.filter((event) => STRUCTURED_KINDS.has(event.kind)), [events])

	useEffect(() => {
		if (expanded) {
			bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
		}
	}, [structured.length, expanded])

	return (
		<div className="rounded-lg border border-edge bg-carbon">
			<button
				type="button"
				onClick={() => setExpanded((prev) => !prev)}
				className="flex w-full items-center gap-2 px-3 py-1.5 text-left"
			>
				{expanded ? (
					<ChevronDown className="h-3 w-3 text-dim" />
				) : (
					<ChevronRight className="h-3 w-3 text-dim" />
				)}
				<span className="font-data text-[11px] text-silver">EVENTS ({structured.length})</span>
			</button>

			{expanded ? (
				<div className="max-h-64 overflow-y-auto border-t border-edge px-3 py-2">
					{structured.length === 0 ? (
						<p className="font-data text-[11px] text-dim">No structured events yet.</p>
					) : null}
					{structured.map((event) => (
						<div key={event.id} className="font-data flex gap-2 py-0.5 text-[11px]">
							<span className="shrink-0 text-dim">
								{new Date(event.ts).toLocaleTimeString()}
							</span>
							<span className={`w-12 shrink-0 ${levelColor[event.level]}`}>{event.level}</span>
							<span className={levelColor[event.level]}>{event.message}</span>
						</div>
					))}
					<div ref={bottomRef} />
				</div>
			) : null}
		</div>
	)
}
