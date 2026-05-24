import { RunInspector } from '@/components/run-inspector/RunInspector'
import { EmptyState } from '@/components/ui/state-empty'
import { ErrorState } from '@/components/ui/state-error'
import { LoadingState } from '@/components/ui/state-loading'
import { useEventStream } from '@/hooks/useEventStream'
import { useRunDetail, type LoadedRunDetail } from '@/hooks/useRunDetail'
import { FileSearch } from 'lucide-react'

interface RunInspectorPageProps {
	runId: string
	refTime: number
}

export function RunInspectorPage({ runId, refTime }: RunInspectorPageProps) {
	const detail = useRunDetail(runId)
	const stream = useEventStream(detail.run?.id ?? runId, detail.syncRun)

	if (detail.loading) {
		return (
			<div className="px-4 py-4">
				<LoadingState rows={3} />
			</div>
		)
	}
	if (detail.error) {
		return (
			<div className="px-4 py-4">
				<ErrorState title="Run load failed" message={detail.error} onRetry={detail.refresh} />
			</div>
		)
	}
	if (!detail.run) {
		return (
			<div className="px-4 py-4">
				<EmptyState
					icon={FileSearch}
					title="Run not found"
					description="It may have been deleted or the identifier is wrong."
					density="compact"
				/>
			</div>
		)
	}

	return <RunInspector detail={detail as LoadedRunDetail} events={stream.events} refTime={refTime} />
}
