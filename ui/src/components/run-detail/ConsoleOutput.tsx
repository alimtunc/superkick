import type { EventLevel, RunEvent } from '@/types'

const levelColor: Record<EventLevel, string> = {
	debug: 'text-dim',
	info: 'text-silver',
	warn: 'text-gold',
	error: 'text-oxide'
}

export function ConsoleOutput({
	events,
	bottomRef
}: {
	events: RunEvent[]
	bottomRef: React.RefObject<HTMLDivElement | null>
}) {
	return (
		<div className="font-data max-h-96 space-y-px overflow-y-auto px-3 py-2 text-[11px]">
			{events.length === 0 ? <p className="text-dim">Waiting for events...</p> : null}
			{events.map((event) => (
				<ConsoleEntry key={event.id} event={event} />
			))}
			<div ref={bottomRef} />
		</div>
	)
}

function ConsoleEntry({ event }: { event: RunEvent }) {
	const isOperator = event.kind === 'operator_input'

	return (
		<div className="flex gap-2 py-0.5">
			<span className="shrink-0 text-dim">{new Date(event.ts).toLocaleTimeString()}</span>
			<span className={`w-12 shrink-0 ${levelColor[event.level]}`}>{event.level}</span>
			{isOperator ? <span className="shrink-0 text-cyan">{'>'}</span> : null}
			<span className={`break-words ${isOperator ? 'text-cyan' : levelColor[event.level]}`}>
				{event.message}
			</span>
		</div>
	)
}
