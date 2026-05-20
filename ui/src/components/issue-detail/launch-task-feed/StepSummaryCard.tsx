import { Pill } from '@/components/ui/pill'
import { CHANGED_FILES_VISIBLE } from '@/lib/launch/display'
import type { LaunchTaskStepStatus, StepResult } from '@/types'

interface StepSummaryCardProps {
	result: StepResult
	status: LaunchTaskStepStatus
}

export function StepSummaryCard({ result, status }: StepSummaryCardProps) {
	const summary = result.summary.trim()
	const changedFiles = result.changed_files
	const visibleFiles = changedFiles.slice(0, CHANGED_FILES_VISIBLE)
	const hiddenCount = Math.max(0, changedFiles.length - visibleFiles.length)
	const showQuestions = status === 'needs_human' && result.questions.length > 0

	return (
		<div className="flex flex-col gap-2.5 rounded-md border border-border bg-raised px-3 py-2.5">
			{summary ? <p className="leading-normal text-fg">{summary}</p> : null}
			{changedFiles.length > 0 ? (
				<div className="flex flex-wrap items-center gap-1.5">
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
			{showQuestions ? (
				<ul className="flex list-disc flex-col gap-1 pl-4 text-fg-muted">
					{result.questions.map((question) => (
						<li key={question} className="leading-normal">
							{question}
						</li>
					))}
				</ul>
			) : null}
		</div>
	)
}
