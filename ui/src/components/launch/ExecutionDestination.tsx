import type { LaunchWorktreeStrategy } from '@/types'
import { Icon } from '@/ui/Icon'

interface ExecutionDestinationProps {
	repoSlug: string | null
	baseBranch: string
	strategy: LaunchWorktreeStrategy
}

export function ExecutionDestination({ repoSlug, baseBranch, strategy }: ExecutionDestinationProps) {
	const repoLabel = repoSlug ?? 'this repository'
	const destinationText =
		strategy === 'new_worktree' ? 'new worktree from base' : 'current checkout on base'

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
