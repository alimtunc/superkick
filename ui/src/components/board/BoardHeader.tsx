import { RefreshHeader } from '@/components/run-shared/RefreshHeader'

interface BoardHeaderProps {
	openCount: number
	needsHumanCount: number
	loading: boolean
	lastRefresh: number | null
	onRefresh: () => void
}

export function BoardHeader({
	openCount,
	needsHumanCount,
	loading,
	lastRefresh,
	onRefresh
}: BoardHeaderProps) {
	return (
		<RefreshHeader
			title="BOARD"
			countText={`${openCount} in flight`}
			needsText={needsHumanCount > 0 ? `${needsHumanCount} need you` : null}
			loading={loading}
			lastRefresh={lastRefresh}
			onRefresh={onRefresh}
			maxWidthClass="max-w-360"
		/>
	)
}
