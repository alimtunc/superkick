import { CopyValue } from '@/components/run-detail/CopyValue'
import { Tooltip } from '@/components/ui/tooltip'
import { useOpenTakeover } from '@/hooks/useTerminalTakeover'
import { middleTruncate } from '@/lib/path'
import { TerminalSquare } from 'lucide-react'
import { toast } from 'sonner'

interface WorktreeActionsProps {
	runId: string
	worktreePath: string | null
	branchName: string | null
}

const PATH_MAX = 56

export function WorktreeActions({ runId, worktreePath, branchName }: WorktreeActionsProps) {
	const openTakeover = useOpenTakeover(runId)

	const handleOpenTerminal = () => {
		openTakeover
			.mutateAsync({ mode: 'inspect' })
			.then(() => toast('Shell opened — open the Shell tab to attach'))
			.catch((error: unknown) => {
				const message = error instanceof Error ? error.message : 'Failed to open shell'
				toast.error(message)
			})
	}

	if (!worktreePath) {
		return (
			<div className="flex items-center gap-3 border-b border-border bg-surface px-6 py-2.5">
				<span className="text-[11px] font-semibold tracking-wider text-fg-dim uppercase">
					Worktree
				</span>
				<span className="font-mono text-[12px] text-fg-muted">No worktree yet</span>
			</div>
		)
	}

	const truncated = middleTruncate(worktreePath, PATH_MAX)

	return (
		<div className="flex items-center gap-3 border-b border-border bg-surface px-6 py-2.5">
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
			<button
				type="button"
				onClick={handleOpenTerminal}
				disabled={openTakeover.isPending}
				className="inline-flex items-center gap-1.5 rounded-md border border-border bg-raised px-2.5 py-1 text-[11.5px] text-fg transition-colors hover:bg-raised/70 focus-visible:ring-2 focus-visible:ring-mineral/40 focus-visible:outline-none disabled:opacity-50"
			>
				<TerminalSquare size={12} strokeWidth={1.75} />
				Open terminal here
			</button>
		</div>
	)
}
