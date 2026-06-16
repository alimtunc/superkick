import { Pill } from '@/components/primitives'
import type { IssuePrDiffFile, PrInboxItem } from '@/types'
import { Link } from '@tanstack/react-router'

import { PrChecksBadge } from './PrChecksBadge'
import { ReviewerRow } from './ReviewerRow'
import { ReviewFileRow } from './ReviewFileRow'
import { ReviewRailGroup } from './ReviewRailGroup'
import { checksDetail, prReviewStatus } from './reviewStatus'

const MAX_FILES = 8

interface PrReviewRailProps {
	pr: PrInboxItem
	linkedIssueId?: string | null
	diffFiles: IssuePrDiffFile[]
	diffLoading: boolean
	onOpenDiff: () => void
}

export function PrReviewRail({ pr, linkedIssueId, diffFiles, diffLoading, onOpenDiff }: PrReviewRailProps) {
	const status = prReviewStatus(pr)
	const checksBreakdown = pr.checks ? checksDetail(pr.checks) : null
	const fileCount = diffFiles.length
	const shown = diffFiles.slice(0, MAX_FILES)
	const remaining = fileCount - shown.length
	const showFiles = diffLoading || fileCount > 0

	return (
		<aside aria-label="Review details" className="detail__rail">
			<ReviewRailGroup label="Status">
				<Pill tone={status.tone} size="sm" dot>
					{status.label}
				</Pill>
			</ReviewRailGroup>

			<ReviewRailGroup label="Reviewers">
				{pr.reviewers.length === 0 ? (
					<span className="text-[12px] text-fg-dim">No reviewers assigned</span>
				) : (
					<ul className="flex flex-col gap-1.5">
						{pr.reviewers.map((reviewer) => (
							<ReviewerRow key={reviewer.login} reviewer={reviewer} />
						))}
					</ul>
				)}
			</ReviewRailGroup>

			{pr.checks ? (
				<ReviewRailGroup label="Checks">
					<div className="flex flex-col items-start gap-1.5">
						<PrChecksBadge checks={pr.checks} size="sm" />
						{checksBreakdown ? (
							<span className="text-[11px] text-fg-dim">{checksBreakdown}</span>
						) : null}
					</div>
				</ReviewRailGroup>
			) : null}

			{pr.linkedIssueIdentifier ? (
				<ReviewRailGroup label="Resolves">
					{linkedIssueId ? (
						<Link
							to="/issues/$issueId"
							params={{ issueId: linkedIssueId }}
							className="inline-flex"
						>
							<Pill tone="neutral" size="sm" mono interactive>
								{pr.linkedIssueIdentifier}
							</Pill>
						</Link>
					) : (
						<Pill tone="neutral" size="sm" mono>
							{pr.linkedIssueIdentifier}
						</Pill>
					)}
				</ReviewRailGroup>
			) : null}

			{showFiles ? (
				<ReviewRailGroup label={fileCount > 0 ? `Files changed · ${fileCount}` : 'Files changed'}>
					{diffLoading && fileCount === 0 ? (
						<span className="text-[12px] text-fg-dim">Loading…</span>
					) : (
						<ul className="flex flex-col gap-1">
							{shown.map((file) => (
								<ReviewFileRow key={file.path} file={file} onOpenDiff={onOpenDiff} />
							))}
							{remaining > 0 ? (
								<li>
									<button
										type="button"
										onClick={onOpenDiff}
										className="text-[12px] text-fg-dim hover:text-fg"
									>
										+{remaining} more in Diff
									</button>
								</li>
							) : null}
						</ul>
					)}
				</ReviewRailGroup>
			) : null}
		</aside>
	)
}
