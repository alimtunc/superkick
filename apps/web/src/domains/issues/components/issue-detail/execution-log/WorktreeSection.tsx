import { WorktreeMini } from '@/domains/issues/components/issue-detail/execution-log/WorktreeMini'
import type { WorktreeFacts } from '@/types'

interface WorktreeSectionProps {
	facts: WorktreeFacts
}

export function WorktreeSection({ facts }: WorktreeSectionProps) {
	if (!facts.branch && !facts.worktreePath && !facts.pr) return null

	return (
		<div className="worktree">
			<WorktreeMini facts={facts} />
		</div>
	)
}
