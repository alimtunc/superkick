import { Pill } from '@/components/primitives'
import { WorktreeFooterRow } from '@/domains/chat/components/workspace/WorktreeFooterRow'
import { getFailureCopy } from '@/lib/domain'
import { CHANGED_FILES_VISIBLE } from '@/lib/launch/display'
import type {
	FailureClassification,
	LaunchTask,
	LaunchTaskStatus,
	LaunchTaskStep,
	TerminalKind
} from '@/types'

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
	const isFailure = kind === 'failure'
	const result = finalStep?.structured_result ?? null
	const changedFiles = result?.changed_files ?? []
	const visibleFiles = changedFiles.slice(0, CHANGED_FILES_VISIBLE)
	const hiddenCount = Math.max(0, changedFiles.length - visibleFiles.length)

	const failureCopy =
		isFailure && classification ? getFailureCopy(classification, finalStep?.auto_resume_count ?? 0) : null
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

	const showWorktreeRow = worktreePath !== null || !isFailure

	return (
		<section className="border-b border-border bg-surface px-6 py-4">
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
					<div className="mt-3 border-t border-border pt-2.5">
						<WorktreeFooterRow
							runId={linkedRunId}
							worktreePath={worktreePath}
							branchName={branchName}
							emptyLabel="No worktree was created"
						/>
					</div>
				) : null}
			</div>
		</section>
	)
}
