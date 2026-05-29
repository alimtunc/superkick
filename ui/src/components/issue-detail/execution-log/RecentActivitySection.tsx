import { ExecRow } from '@/components/issue-detail/execution-log/ExecRow'
import { ExecSection } from '@/components/issue-detail/execution-log/ExecSection'
import { useRunDrawerStore } from '@/stores/runDrawer'
import type { ExecActivityRow } from '@/types'
import { Btn } from '@/ui'

interface RecentActivitySectionProps {
	rows: readonly ExecActivityRow[]
	runId: string | null
}

export function RecentActivitySection({ rows, runId }: RecentActivitySectionProps) {
	const openDrawer = useRunDrawerStore((s) => s.openDrawer)
	if (rows.length === 0) return null

	return (
		<ExecSection
			title="Recent activity"
			count={rows.length}
			action={
				runId ? (
					<Btn
						kind="ghost"
						size="sm"
						iconRight="arrowRight"
						onClick={() => openDrawer(runId, 'activity')}
					>
						All in drawer
					</Btn>
				) : null
			}
		>
			<div className="flex flex-col gap-2">
				{rows.map((row) => (
					<ExecRow key={row.id} row={row} />
				))}
			</div>
		</ExecSection>
	)
}
