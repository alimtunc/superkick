import { Btn } from '@/components/primitives'
import { ExecFileRow } from '@/domains/issues/components/issue-detail/execution-log/ExecFileRow'
import { useRunDrawerStore } from '@/stores/runDrawer'
import type { ExecFileChange } from '@/types'

interface FilesChangedSectionProps {
	files: readonly ExecFileChange[]
	runId: string | null
}

export function FilesChangedSection({ files, runId }: FilesChangedSectionProps) {
	const openDrawer = useRunDrawerStore((s) => s.openDrawer)
	if (files.length === 0) return null

	return (
		<div className="execfiles">
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					fontSize: 'var(--text-11)',
					textTransform: 'uppercase',
					letterSpacing: 'var(--tracking-wide)',
					color: 'var(--fg-dim)',
					padding: 'var(--space-2) var(--space-4) var(--space-3)',
					fontWeight: 600
				}}
			>
				<span>{files.length} files changed</span>
				{runId ? (
					<span style={{ marginLeft: 'auto' }}>
						<Btn
							kind="ghost"
							size="sm"
							icon="external"
							onClick={() => openDrawer(runId, 'files')}
						>
							Diff
						</Btn>
					</span>
				) : null}
			</div>
			{files.map((file) => (
				<ExecFileRow key={file.path} file={file} />
			))}
		</div>
	)
}
