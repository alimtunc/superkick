import { ToolCallRow } from '@/components/run-detail/RunWorkspaceTabs/ToolCallRow'
import { TabEmptyState } from '@/components/ui/state-empty-tab'
import { useRunToolCalls } from '@/hooks/useRunToolCalls'
import type { RunEvent } from '@/types'
import { Wrench } from 'lucide-react'

interface ToolsTabProps {
	runId: string
	events?: readonly RunEvent[]
}

const NO_EVENTS: readonly RunEvent[] = []

export function ToolsTab({ runId, events = NO_EVENTS }: ToolsTabProps) {
	const { calls, isLoading, error } = useRunToolCalls(runId, events)

	if (isLoading) {
		return <TabEmptyState icon={Wrench} title="Loading tool calls…" />
	}

	if (error) {
		return (
			<TabEmptyState
				icon={Wrench}
				title="Tool calls unavailable"
				description="The tool-call projection failed to load. Refresh the page to retry."
			/>
		)
	}

	if (calls.length === 0) {
		return (
			<TabEmptyState
				icon={Wrench}
				title="No tool calls yet"
				description="Tool calls will appear here as the run progresses."
			/>
		)
	}

	return (
		<div>
			{calls.map((call) => (
				<ToolCallRow key={`${call.turn_id}:${call.call_id}`} call={call} />
			))}
		</div>
	)
}
