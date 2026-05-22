import { CopyValue } from '@/components/run-detail/CopyValue'
import { InspectorSection } from '@/components/ui/inspector-section'
import { Tooltip } from '@/components/ui/tooltip'
import { WORKTREE_PATH_MAX } from '@/lib/launch/display'
import { middleTruncate } from '@/lib/path'
import { FolderGit2, GitBranch } from 'lucide-react'

interface NowWorktreeProps {
	worktreePath: string | null
	branchName: string | null
}

export function NowWorktree({ worktreePath, branchName }: NowWorktreeProps) {
	if (!worktreePath && !branchName) {
		return (
			<InspectorSection label="Worktree">
				<p className="font-data mt-2 text-[11.5px] text-fg-muted">No worktree yet</p>
			</InspectorSection>
		)
	}

	const truncated = worktreePath ? middleTruncate(worktreePath, WORKTREE_PATH_MAX) : null

	return (
		<InspectorSection label="Worktree">
			<div className="mt-2 flex flex-col gap-1.5">
				{worktreePath ? (
					<Tooltip label={worktreePath}>
						<CopyValue
							value={worktreePath}
							display={
								<span className="inline-flex items-center gap-1.5 font-mono text-[11.5px] text-fg">
									<FolderGit2 size={12} strokeWidth={1.85} aria-hidden="true" />
									{truncated}
								</span>
							}
						/>
					</Tooltip>
				) : null}
				{branchName ? (
					<CopyValue
						value={branchName}
						display={
							<span className="inline-flex items-center gap-1.5 font-mono text-[11.5px] text-fg-muted">
								<GitBranch size={12} strokeWidth={1.85} aria-hidden="true" />
								{branchName}
							</span>
						}
					/>
				) : null}
			</div>
		</InspectorSection>
	)
}
