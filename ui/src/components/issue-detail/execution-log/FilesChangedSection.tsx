import { ExecFileRow } from '@/components/issue-detail/execution-log/ExecFileRow'
import { ExecSection } from '@/components/issue-detail/execution-log/ExecSection'
import { useRunDrawerStore } from '@/stores/runDrawer'
import type { ExecFileChange } from '@/types'
import { Btn } from '@/ui'

interface FilesChangedSectionProps {
	files: readonly ExecFileChange[]
	runId: string | null
}

export function FilesChangedSection({ files, runId }: FilesChangedSectionProps) {
	const openDrawer = useRunDrawerStore((s) => s.openDrawer)
	if (files.length === 0) return null

	return (
		<ExecSection
			title="Files changed"
			count={files.length}
			action={
				runId ? (
					<Btn kind="ghost" size="sm" icon="external" onClick={() => openDrawer(runId, 'files')}>
						Diff
					</Btn>
				) : null
			}
		>
			<div className="flex flex-col gap-[7px]">
				{files.map((file) => (
					<ExecFileRow key={file.path} file={file} />
				))}
			</div>
		</ExecSection>
	)
}
