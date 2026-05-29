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
		<>
			{branch ? (
				<span className="wfact">
					<span className="wfact__k">branch</span>
					<Icon name="branch" size={13} className="ic" />
					<span className="wfact__v">{branch}</span>
				</span>
			) : null}
			{worktreePath ? (
				<span className="wfact">
					<span className="wfact__k">worktree</span>
					<span className="wfact__v">{worktreePath}</span>
				</span>
			) : null}
			{pr ? (
				<span className="wfact">
					<span className="wfact__k">PR</span>
					<Icon name="pr" size={13} className="ic" />
					<span className="wfact__v">
						<a href={pr.url} target="_blank" rel="noopener noreferrer">
							#{pr.number}
						</a>
					</span>
				</span>
			) : null}
			{cloneCommand ? (
				<span className="wfact">
					<Btn
						kind="ghost"
						size="sm"
						icon="copy"
						onClick={() => void navigator.clipboard?.writeText(cloneCommand)}
					>
						Copy clone command
					</Btn>
				</span>
			) : null}
		</>
	)
}
