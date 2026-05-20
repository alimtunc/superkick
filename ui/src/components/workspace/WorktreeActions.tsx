import { WorktreeFooterRow } from './WorktreeFooterRow'

interface WorktreeActionsProps {
	runId: string
	worktreePath: string | null
	branchName: string | null
}

export function WorktreeActions({ runId, worktreePath, branchName }: WorktreeActionsProps) {
	return (
		<div className="border-b border-border bg-surface px-6 py-2.5">
			<WorktreeFooterRow
				runId={runId}
				worktreePath={worktreePath}
				branchName={branchName}
				emptyLabel="No worktree yet"
			/>
		</div>
	)
}
