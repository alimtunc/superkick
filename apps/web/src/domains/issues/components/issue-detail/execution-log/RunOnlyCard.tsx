import { Btn, Icon } from '@/components/primitives'
import { RunChip } from '@/domains/runs/components/run-shared/RunChip'
import { useRunDrawerStore } from '@/stores/runDrawer'
import type { LinkedRunSummary } from '@/types'

interface RunOnlyCardProps {
	run: LinkedRunSummary
}

export function RunOnlyCard({ run }: RunOnlyCardProps) {
	const openDrawer = useRunDrawerStore((s) => s.openDrawer)

	return (
		<section aria-label="Active run" className="execlog">
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 'var(--space-5)',
					padding: 'var(--space-7) var(--space-6)'
				}}
			>
				<div className="empty-state__icon" style={{ width: 36, height: 36 }}>
					<Icon name="zap" size={18} className="ic" />
				</div>
				<div style={{ flex: 1 }}>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 'var(--space-3)',
							fontSize: 'var(--text-13)',
							fontWeight: 'var(--fw-medium)'
						}}
					>
						Active run
						<RunChip state={run.state} glyph="icon" />
					</div>
					<div style={{ fontSize: 'var(--text-12)', color: 'var(--fg-dim)', marginTop: 2 }}>
						This issue has a run with no launch task. Open it for live progress and detail.
					</div>
				</div>
				<Btn kind="ghost" size="sm" icon="external" onClick={() => openDrawer(run.id, 'activity')}>
					Open run
				</Btn>
			</div>
		</section>
	)
}
