import { useEffect, useMemo, useRef, useState } from 'react'

import { ConsoleFilterBar, TAB_FILTERS, type FilterTab } from '@/components/run-detail/ConsoleFilterBar'
import { ConsoleHeader } from '@/components/run-detail/ConsoleHeader'
import { ConsoleInput } from '@/components/run-detail/ConsoleInput'
import { ConsoleOutput } from '@/components/run-detail/ConsoleOutput'
import type { ExecutionMode, RunEvent } from '@/types'

interface OperatorConsoleProps {
	runId: string
	executionMode: ExecutionMode | undefined
	isTerminal: boolean
	events: RunEvent[]
	connected: boolean
	done: boolean
}

export function OperatorConsole({
	runId,
	executionMode,
	isTerminal,
	events,
	connected,
	done
}: OperatorConsoleProps) {
	const [activeTab, setActiveTab] = useState<FilterTab>('output')

	const filtered = useMemo(() => {
		const kinds = TAB_FILTERS[activeTab]
		return kinds ? events.filter((event) => kinds.has(event.kind)) : events
	}, [events, activeTab])

	const errorCount = useMemo(() => events.filter((event) => event.level === 'error').length, [events])

	const bottomRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
	}, [filtered.length])

	return (
		<div className="rounded-lg border border-edge bg-carbon">
			<ConsoleHeader
				connected={connected}
				done={done}
				executionMode={executionMode}
				eventCount={filtered.length}
			/>
			<ConsoleFilterBar activeTab={activeTab} onTabChange={setActiveTab} errorCount={errorCount} />
			<ConsoleOutput events={filtered} bottomRef={bottomRef} />
			<ConsoleInput runId={runId} isTerminal={isTerminal} />
		</div>
	)
}
