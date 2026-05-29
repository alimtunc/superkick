import { ExecSection } from '@/components/issue-detail/execution-log/ExecSection'
import { WorktreeMini } from '@/components/issue-detail/execution-log/WorktreeMini'
import type { WorktreeFacts } from '@/types'

interface WorktreeSectionProps {
	facts: WorktreeFacts
}

export function WorktreeSection({ facts }: WorktreeSectionProps) {
	if (!facts.branch && !facts.worktreePath && !facts.pr) return null

	return (
		<ExecSection title="Worktree · how to test">
			<WorktreeMini facts={facts} />
		</ExecSection>
	)
}
