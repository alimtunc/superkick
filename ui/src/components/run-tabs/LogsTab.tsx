import { TabEmptyState } from '@/components/ui/state-empty-tab'
import { fmtRelativeTime } from '@/lib/domain'
import type { RunEvent } from '@/types'
import { Icon } from '@/ui/Icon'
import { ScrollText } from 'lucide-react'

const LOG_KINDS = new Set(['agent_output', 'command_output'])

interface LogsTabProps {
	events: RunEvent[]
	onOpenTerminal?: () => void
}

function TerminalTranscriptLink({ onOpenTerminal }: { onOpenTerminal: () => void }) {
	return (
		<div className="flex items-center justify-between gap-3 border-b border-border bg-canvas px-4 py-2">
			<span className="font-data text-[11px] text-fg-dim">
				These rows are agent and shell event messages — not the raw PTY transcript.
			</span>
			<button
				type="button"
				onClick={onOpenTerminal}
				className="inline-flex shrink-0 items-center gap-1 rounded text-[11.5px] text-fg-muted hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
			>
				Full terminal transcript
				<Icon name="external" size={11} className="ic" />
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
			<div className="min-h-0 flex-1 overflow-y-auto p-4">
				<div className="terminal">
					{logs.map((event) => (
						<div key={event.id}>
							<span className="c-dim">[{fmtRelativeTime(event.ts)}] </span>
							<span className="c-accent">
								{event.kind === 'agent_output' ? 'agent' : 'shell'}
							</span>{' '}
							<span className={event.level === 'error' ? 'c-danger' : 'c-fg'}>
								{event.message}
							</span>
						</div>
					))}
				</div>
			</div>
		</div>
	)
}
