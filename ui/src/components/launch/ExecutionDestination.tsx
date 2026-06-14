import type { LaunchWorktreeStrategy } from '@/types'
import { Icon } from '@/ui/Icon'

interface ExecutionDestinationProps {
	repoSlug: string | null
	baseBranch: string
	strategy: LaunchWorktreeStrategy
	reuseBranch: string | null
}

function destinationLabel(strategy: LaunchWorktreeStrategy, reuseBranch: string | null): string {
	if (strategy === 'reuse_worktree') {
		return reuseBranch ? `existing worktree (${reuseBranch})` : 'existing worktree'
	}
	if (strategy === 'current_checkout') return 'current checkout on base'
	return 'new worktree from base'
}

export function ExecutionDestination({
	repoSlug,
	baseBranch,
	strategy,
	reuseBranch
}: ExecutionDestinationProps) {
	const repoLabel = repoSlug ?? 'this repository'
	const destinationText = destinationLabel(strategy, reuseBranch)

	return (
		<div
			aria-label="Execution destination"
			className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-fg-dim"
		>
			<Icon name="arrowRight" size={11} className="text-fg-dim" />
			<span>Runs in</span>
			<span className="font-medium text-fg">{destinationText}</span>
			<span aria-hidden="true">·</span>
			<span>repo</span>
			<span className="font-medium text-fg">{repoLabel}</span>
			<span aria-hidden="true">·</span>
			<span>base</span>
			<span className="font-medium text-fg">{baseBranch}</span>
		</div>
	)
}
