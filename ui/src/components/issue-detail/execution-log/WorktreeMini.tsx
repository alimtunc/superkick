import { RunPrBadge } from '@/components/issue-detail/RunPrBadge'
import type { WorktreeFacts } from '@/types'
import { Btn, Icon } from '@/ui'

interface WorktreeMiniProps {
	facts: WorktreeFacts
}

export function WorktreeMini({ facts }: WorktreeMiniProps) {
	const { branch, worktreePath, pr } = facts
	if (!branch && !worktreePath && !pr) return null

	const cloneCommand = branch ? `git fetch origin && git switch ${branch}` : null

	return (
		<div className="flex flex-col gap-2.5">
			<div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[11.5px]">
				{branch ? (
					<span className="inline-flex items-center gap-1.5">
						<Icon name="branch" size={11} className="text-fg-dim" />
						<span className="font-data text-fg">{branch}</span>
					</span>
				) : null}
				{worktreePath ? (
					<span className="inline-flex min-w-0 items-center gap-1.5">
						<Icon name="folder" size={11} className="text-fg-dim" />
						<span className="font-data truncate text-fg-muted">{worktreePath}</span>
					</span>
				) : null}
				{pr ? <RunPrBadge pr={pr} /> : null}
			</div>
			{cloneCommand ? (
				<div className="flex items-center gap-1.5">
					<Btn
						kind="ghost"
						size="sm"
						icon="copy"
						onClick={() => void navigator.clipboard?.writeText(cloneCommand)}
					>
						Copy clone command
					</Btn>
				</div>
			) : null}
		</div>
	)
}
