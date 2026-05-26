import { RunPrBadge } from '@/components/issue-detail/RunPrBadge'
import type { WorktreeFacts } from '@/types'
import { Folder, GitBranch } from 'lucide-react'

interface WorktreeMiniProps {
	facts: WorktreeFacts
}

export function WorktreeMini({ facts }: WorktreeMiniProps) {
	const { branch, worktreePath, pr } = facts
	if (!branch && !worktreePath && !pr) return null
	return (
		<div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface px-3 py-2 text-[12px] text-fg-muted">
			{branch ? (
				<span className="inline-flex items-center gap-1.5">
					<GitBranch size={12} strokeWidth={1.85} aria-hidden="true" />
					<span className="font-data">{branch}</span>
				</span>
			) : null}
			{worktreePath ? (
				<span className="inline-flex min-w-0 items-center gap-1.5">
					<Folder size={12} strokeWidth={1.85} aria-hidden="true" />
					<span className="font-data truncate">{worktreePath}</span>
				</span>
			) : null}
			{pr ? <RunPrBadge pr={pr} className="ml-auto" /> : null}
		</div>
	)
}
