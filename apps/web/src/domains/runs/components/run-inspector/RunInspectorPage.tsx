import { EmptyState, ErrorState, LoadingState } from '@/components/primitives'
import { RunInspector } from '@/domains/runs/components/run-inspector/RunInspector'
import { useEventStream } from '@/hooks/useEventStream'
import { useRunDetail, type LoadedRunDetail } from '@/hooks/useRunDetail'
import { FileSearch } from 'lucide-react'

interface RunInspectorPageProps {
	runId: string
	refTime: number
}

export function RunInspectorPage({ runId, refTime }: RunInspectorPageProps) {
	const detail = useRunDetail(runId)
	useEventStream(detail.run?.id ?? runId, detail.syncRun)

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
	const { run } = detail
	if (!run) {
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

	const loaded: LoadedRunDetail = { ...detail, run }
	return <RunInspector detail={loaded} refTime={refTime} />
}
