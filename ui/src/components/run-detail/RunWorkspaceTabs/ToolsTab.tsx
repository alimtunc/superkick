import { ToolCallRow } from '@/components/run-detail/RunWorkspaceTabs/ToolCallRow'
import { TabEmptyState } from '@/components/ui/state-empty-tab'
import { runToolCallsQuery } from '@/lib/queries'
import { useQuery } from '@tanstack/react-query'
import { Wrench } from 'lucide-react'

interface ToolsTabProps {
	runId: string
}

export function ToolsTab({ runId }: ToolsTabProps) {
	const { data, isLoading, error } = useQuery(runToolCallsQuery(runId))

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

	const calls = data ?? []
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
		<ul className="divide-y divide-border">
			{calls.map((call) => (
				<ToolCallRow key={`${call.turn_id}:${call.call_id}`} call={call} />
			))}
		</ul>
	)
}
