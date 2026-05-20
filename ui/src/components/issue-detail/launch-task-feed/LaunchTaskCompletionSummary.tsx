import { CopyValue } from '@/components/run-detail/CopyValue'
import { Pill } from '@/components/ui/pill'
import { Tooltip } from '@/components/ui/tooltip'
import { useOpenTakeover } from '@/hooks/useTerminalTakeover'
import { getFailureCopy } from '@/lib/domain'
import { middleTruncate } from '@/lib/path'
import type {
	FailureClassification,
	LaunchTask,
	LaunchTaskStatus,
	LaunchTaskStep,
	TerminalKind
} from '@/types'
import { TerminalSquare } from 'lucide-react'
import { toast } from 'sonner'

const CHANGED_FILES_VISIBLE = 6
const PATH_MAX = 56

const FAILURE_FALLBACK_HEADLINE: Record<LaunchTaskStatus, string> = {
	pending: 'Launch task ended',
	running: 'Launch task ended',
	needs_human: 'Launch task needs attention',
	completed: 'Launch task complete',
	failed: 'Launch task failed',
	cancelled: 'Launch task cancelled'
}

interface LaunchTaskCompletionSummaryProps {
	kind: TerminalKind
	task: LaunchTask
	finalStep: LaunchTaskStep | null
	classification: FailureClassification | null
	linkedRunId: string | null
	worktreePath: string | null
	branchName: string | null
}

export function LaunchTaskCompletionSummary({
	kind,
	task,
	finalStep,
	classification,
	linkedRunId,
	worktreePath,
	branchName
}: LaunchTaskCompletionSummaryProps) {
	const openTakeover = useOpenTakeover(linkedRunId ?? '')

	const isFailure = kind === 'failure'
	const result = finalStep?.structured_result ?? null
	const changedFiles = result?.changed_files ?? []
	const visibleFiles = changedFiles.slice(0, CHANGED_FILES_VISIBLE)
	const hiddenCount = Math.max(0, changedFiles.length - visibleFiles.length)

	const failureCopy = isFailure && classification ? getFailureCopy(classification) : null
	// When a classification is set, its copy is the user-facing message — raw summaries may leak provider noise.
	const summaryText = failureCopy
		? ''
		: result?.summary.trim() || finalStep?.summary?.trim() || task.summary?.trim() || ''
	const headline = isFailure
		? (failureCopy?.headline ?? FAILURE_FALLBACK_HEADLINE[task.status])
		: 'Launch task complete'
	const hint = failureCopy?.hint ?? null
	const detail = failureCopy?.detail ?? null

	const cardClass = isFailure
		? 'rounded-md border border-danger/40 bg-danger-soft px-3.5 py-3'
		: 'rounded-md border border-success/40 bg-success-soft px-3.5 py-3'
	const headlineClass = isFailure
		? 'text-[13px] font-medium text-danger'
		: 'text-[13px] font-medium text-success'

	const handleOpenTerminal = () => {
		if (!linkedRunId) return
		openTakeover
			.mutateAsync({ mode: 'inspect' })
			.then(() => toast('Shell opened — open the Shell tab to attach'))
			.catch((error: unknown) => {
				const message = error instanceof Error ? error.message : 'Failed to open shell'
				toast.error(message)
			})
	}

	const showWorktreeRow = worktreePath !== null || !isFailure
	const truncatedPath = worktreePath ? middleTruncate(worktreePath, PATH_MAX) : null

	return (
		<section className="border-b border-edge bg-surface px-6 py-4">
			<div className={cardClass}>
				<header className="flex flex-col gap-1">
					<span className={headlineClass}>{headline}</span>
					{hint ? <span className="font-mono text-[11.5px] text-fg-muted">{hint}</span> : null}
				</header>
				{summaryText ? (
					<p className="mt-2.5 text-[12.5px] leading-normal text-fg">{summaryText}</p>
				) : null}
				{detail ? (
					<p className="mt-1.5 font-mono text-[11.5px] wrap-break-word text-fg-muted">{detail}</p>
				) : null}
				{changedFiles.length > 0 ? (
					<div className="mt-2.5 flex flex-wrap items-center gap-1.5">
						{visibleFiles.map((file) => (
							<Pill key={file} tone="neutral" size="sm" mono>
								{file}
							</Pill>
						))}
						{hiddenCount > 0 ? (
							<span className="font-mono text-[11px] text-fg-dim">+{hiddenCount} more</span>
						) : null}
					</div>
				) : null}
				{showWorktreeRow ? (
					<div className="mt-3 flex items-center gap-3 border-t border-edge pt-2.5">
						<span className="text-[11px] font-semibold tracking-wider text-fg-dim uppercase">
							Worktree
						</span>
						{worktreePath && truncatedPath ? (
							<Tooltip label={worktreePath}>
								<CopyValue
									value={worktreePath}
									display={
										<span className="truncate font-mono text-[12px] text-fg">
											{truncatedPath}
										</span>
									}
								/>
							</Tooltip>
						) : (
							<span className="font-mono text-[12px] text-fg-muted">
								No worktree was created
							</span>
						)}
						{worktreePath && branchName ? (
							<>
								<span aria-hidden="true" className="text-fg-dim">
									·
								</span>
								<span className="font-mono text-[11.5px] text-fg-muted">{branchName}</span>
							</>
						) : null}
						<span className="flex-1" />
						{worktreePath && linkedRunId ? (
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
				) : null}
			</div>
		</section>
	)
}
