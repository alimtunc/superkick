import { TabEmptyState } from '@/components/ui/state-empty-tab'
import { fmtRelativeTime } from '@/lib/domain'
import type { RunEvent } from '@/types'
import { ArrowUpRight, ScrollText } from 'lucide-react'

const LOG_KINDS = new Set(['agent_output', 'command_output'])

interface LogsTabProps {
	events: RunEvent[]
	onOpenTerminal?: () => void
}

function TerminalTranscriptLink({ onOpenTerminal }: { onOpenTerminal: () => void }) {
	return (
		<div className="flex items-center justify-between gap-3 border-b border-border bg-surface/40 px-4 py-2">
			<span className="font-data text-[11px] text-fg-dim">
				These rows are agent and shell event messages — not the raw PTY transcript.
			</span>
			<button
				type="button"
				onClick={onOpenTerminal}
				className="inline-flex shrink-0 items-center gap-1 rounded text-[11.5px] text-fg-muted hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
			>
				Full terminal transcript
				<ArrowUpRight size={11} strokeWidth={1.85} aria-hidden="true" />
			</button>
		</div>
	)
}

export function LogsTab({ events, onOpenTerminal }: LogsTabProps) {
	const logs = events.filter((event) => LOG_KINDS.has(event.kind))

	if (logs.length === 0) {
		return (
			<div className="flex h-full min-h-0 flex-col">
				{onOpenTerminal ? <TerminalTranscriptLink onOpenTerminal={onOpenTerminal} /> : null}
				<TabEmptyState
					icon={ScrollText}
					title="No logs yet"
					description="Agent and shell event messages will stream in here once the run produces any."
				/>
			</div>
		)
	}

	return (
		<div className="flex h-full min-h-0 flex-col">
			{onOpenTerminal ? <TerminalTranscriptLink onOpenTerminal={onOpenTerminal} /> : null}
			<div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
				<pre className="font-data text-[11.5px] leading-relaxed whitespace-pre-wrap text-fg-muted">
					{logs.map((event) => (
						<div key={event.id} className="border-b border-border/40 py-1.5 last:border-b-0">
							<span className="text-fg-dim">[{fmtRelativeTime(event.ts)}] </span>
							<span className="font-data text-[10.5px] tracking-wider text-fg-dim uppercase">
								{event.kind === 'agent_output' ? 'agent' : 'shell'}
							</span>{' '}
							<span className={event.level === 'error' ? 'text-danger' : 'text-fg-muted'}>
								{event.message}
							</span>
						</div>
					))}
				</pre>
			</div>
		</div>
	)
}
