import { TabEmptyState } from '@/components/ui/state-empty-tab'
import { fmtRelativeTime } from '@/lib/domain'
import type { RunEvent } from '@/types'
import { ScrollText } from 'lucide-react'

const LOG_KINDS = new Set(['agent_output', 'command_output'])

interface LogsTabProps {
	events: RunEvent[]
}

export function LogsTab({ events }: LogsTabProps) {
	const logs = events.filter((event) => LOG_KINDS.has(event.kind))

	if (logs.length === 0) {
		return (
			<TabEmptyState
				icon={ScrollText}
				title="No logs yet"
				description="Raw agent and command output will stream in here once the run produces any."
			/>
		)
	}

	return (
		<div className="px-4 py-3">
			<pre className="font-data text-[11.5px] leading-relaxed whitespace-pre-wrap text-fg-muted">
				{logs.map((event) => (
					<div key={event.id} className="border-b border-edge/40 py-1.5 last:border-b-0">
						<span className="text-fg-dim">[{fmtRelativeTime(event.ts)}] </span>
						<span className="font-data text-[10.5px] tracking-wider text-fg-dim uppercase">
							{event.kind === 'agent_output' ? 'agent' : 'shell'}
						</span>{' '}
						<span className={event.level === 'error' ? 'text-oxide' : 'text-fg-muted'}>
							{event.message}
						</span>
					</div>
				))}
			</pre>
		</div>
	)
}
