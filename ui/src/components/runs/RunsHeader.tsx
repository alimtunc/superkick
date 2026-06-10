import { RefreshHeader } from '@/components/run-shared/RefreshHeader'

interface RunsHeaderProps {
	/** Open work — active + needs-human + in-review. Excludes the 20-cap "recent". */
	openCount: number
	needsHumanCount: number
	loading: boolean
	lastRefresh: number | null
	onRefresh: () => void
}

export function RunsHeader({ openCount, needsHumanCount, loading, lastRefresh, onRefresh }: RunsHeaderProps) {
	return (
		<RefreshHeader
			title="RUNS"
			countText={`${openCount} open`}
			needsText={needsHumanCount > 0 ? `${needsHumanCount} need human` : null}
			loading={loading}
			lastRefresh={lastRefresh}
			onRefresh={onRefresh}
		/>
	)
}
