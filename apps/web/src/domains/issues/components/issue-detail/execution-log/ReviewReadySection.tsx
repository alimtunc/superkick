import { useState } from 'react'

import { Btn } from '@/components/primitives'
import { useReviewReadyState } from '@/domains/issues/components/issue-detail/execution-log/useReviewReadyState'
import { ShipModal } from '@/domains/launch/components/ship/ShipModal'
import { PrBadge } from '@/domains/reviews/components/pr/PrBadge'
import { openExternal } from '@/lib/openExternal'
import { useRunDrawerStore } from '@/stores/runDrawer'
import type { IssueDetailResponse, LaunchTaskWithSteps, LinkedRunSummary, Run, WorktreeFacts } from '@/types'

interface ReviewReadySectionProps {
	issue: IssueDetailResponse
	task: LaunchTaskWithSteps
	run: LinkedRunSummary | null
	runDetail: Run | null
	worktree: WorktreeFacts | null
}

export function ReviewReadySection({ issue, task, run, runDetail, worktree }: ReviewReadySectionProps) {
	const openDrawer = useRunDrawerStore((s) => s.openDrawer)
	const [shipOpen, setShipOpen] = useState(false)
	const {
		isSuccess,
		headline,
		summary,
		changedFiles,
		autoResume,
		failureHint,
		pr,
		runId,
		baseBranch,
		branchName,
		hasWorktree,
		canReview,
		canShip
	} = useReviewReadyState({ task, run, runDetail, worktree })

	return (
		<section className="border-b border-border bg-surface px-6 py-4">
			<div
				className={
					isSuccess
						? 'rounded-md border border-success/40 bg-success-soft px-3.5 py-3'
						: 'rounded-md border border-danger/40 bg-danger-soft px-3.5 py-3'
				}
			>
				<div className="flex items-center gap-2">
					<span
						className={
							isSuccess
								? 'text-[13px] font-medium text-success'
								: 'text-[13px] font-medium text-danger'
						}
					>
						{headline}
					</span>
					{pr ? <PrBadge pr={pr} size="sm" /> : null}
					{autoResume > 0 ? (
						<span className="text-[11px] text-fg-dim">· resumed {autoResume}×</span>
					) : null}
				</div>
				{failureHint ? <p className="mt-1.5 text-[11.5px] text-fg-muted">{failureHint}</p> : null}
				{isSuccess && summary ? (
					<p className="mt-2 text-[12.5px] leading-normal text-fg">{summary}</p>
				) : null}
				<div className="mt-3 flex items-center gap-2">
					{canReview && runId ? (
						<Btn
							kind="secondary"
							size="sm"
							icon="external"
							onClick={() => openDrawer(runId, 'files')}
						>
							Review changes
						</Btn>
					) : null}
					{pr ? (
						<Btn
							kind="secondary"
							size="sm"
							icon="external"
							onClick={() => void openExternal(pr.url)}
						>
							Open PR
						</Btn>
					) : canShip ? (
						<Btn kind="primary" size="sm" icon="branch" onClick={() => setShipOpen(true)}>
							Ship…
						</Btn>
					) : null}
					{!hasWorktree ? (
						<span className="text-[11.5px] text-fg-dim">
							No worktree — nothing to review or ship.
						</span>
					) : null}
				</div>
			</div>
			{canShip && runId ? (
				<ShipModal
					open={shipOpen}
					onOpenChange={setShipOpen}
					issue={issue}
					taskId={task.task.id}
					runId={runId}
					baseBranch={baseBranch}
					headBranch={branchName}
					prExists={pr !== null}
					defaultTitle={issue.title}
					summary={summary}
					changedFiles={changedFiles}
				/>
			) : null}
		</section>
	)
}
