import { ExecRow } from '@/components/issue-detail/execution-log/ExecRow'
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
		<div className="execrows">
			{rows.map((row) => (
				<ExecRow key={row.id} row={row} />
			))}
			{runId ? (
				<div className="execrow" style={{ paddingTop: 'var(--space-1)' }}>
					<span className="execrow__icon" />
					<Btn
						kind="ghost"
						size="sm"
						iconRight="arrowRight"
						onClick={() => openDrawer(runId, 'activity')}
					>
						All in drawer
					</Btn>
				</div>
			) : null}
		</div>
	)
}
