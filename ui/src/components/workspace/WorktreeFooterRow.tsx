import { CopyValue } from '@/components/run-detail/CopyValue'
import { Tooltip } from '@/components/ui/tooltip'
import { useOpenTakeover } from '@/hooks/useTerminalTakeover'
import { WORKTREE_PATH_MAX } from '@/lib/launch/display'
import { middleTruncate } from '@/lib/path'
import { TerminalSquare } from 'lucide-react'
import { toast } from 'sonner'

interface WorktreeFooterRowProps {
	runId: string | null
	worktreePath: string | null
	branchName: string | null
	emptyLabel: string
}

export function WorktreeFooterRow({ runId, worktreePath, branchName, emptyLabel }: WorktreeFooterRowProps) {
	const openTakeover = useOpenTakeover(runId ?? '')

	const handleOpenTerminal = () => {
		if (!runId) return
		void openTakeover
			.mutateAsync({ mode: 'inspect' })
			.then(() => toast('Shell opened — open the Shell tab to attach'))
			.catch((error: unknown) => {
				const message = error instanceof Error ? error.message : 'Failed to open shell'
				toast.error(message)
			})
	}

	if (!worktreePath) {
		return (
			<div className="flex items-center gap-3">
				<span className="text-[11px] font-semibold tracking-wider text-fg-dim uppercase">
					Worktree
				</span>
				<span className="font-mono text-[12px] text-fg-muted">{emptyLabel}</span>
			</div>
		)
	}

	const truncated = middleTruncate(worktreePath, WORKTREE_PATH_MAX)

	return (
		<div className="flex items-center gap-3">
			<span className="text-[11px] font-semibold tracking-wider text-fg-dim uppercase">Worktree</span>
			<Tooltip label={worktreePath}>
				<CopyValue
					value={worktreePath}
					display={<span className="truncate font-mono text-[12px] text-fg">{truncated}</span>}
				/>
			</Tooltip>
			{branchName ? (
				<>
					<span aria-hidden="true" className="text-fg-dim">
						·
					</span>
					<span className="font-mono text-[11.5px] text-fg-muted">{branchName}</span>
				</>
			) : null}
			<span className="flex-1" />
			{runId ? (
				<button
					type="button"
					onClick={handleOpenTerminal}
					disabled={openTakeover.isPending}
					className="inline-flex items-center gap-1.5 rounded-md border border-border bg-raised px-2.5 py-1 text-[11.5px] text-fg transition-colors hover:bg-raised/70 focus-visible:ring-2 focus-visible:ring-mineral/40 focus-visible:outline-none disabled:opacity-50"
				>
					<TerminalSquare size={12} strokeWidth={1.75} />
					Open terminal here
				</button>
			) : null}
		</div>
	)
}
