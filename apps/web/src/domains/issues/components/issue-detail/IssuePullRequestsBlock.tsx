import { useMemo, useState } from 'react'

import { ExternalLink } from '@/components/composites/external-link'
import { IssuePrDiffDrawer } from '@/domains/issues/components/issue-detail/IssuePrDiffDrawer'
import { PropertyRow } from '@/domains/issues/components/issue-detail/properties/PropertyRow'
import { PrBadge } from '@/domains/reviews/components/pr/PrBadge'
import type { IssueDetailResponse, IssuePullRequest, LinkedPrSummary } from '@/types'
import { ExternalLink as ExternalLinkIcon, FileDiff } from 'lucide-react'

interface IssuePullRequestsBlockProps {
	issue: IssueDetailResponse
	runPr: LinkedPrSummary | null
}

export function IssuePullRequestsBlock({ issue, runPr }: IssuePullRequestsBlockProps) {
	const issuePrs = useMemo(() => issue.linked_prs ?? [], [issue.linked_prs])
	const [selectedPr, setSelectedPr] = useState<IssuePullRequest | null>(null)

	if (issuePrs.length === 0 && !runPr) return null

	if (issuePrs.length === 0 && runPr) {
		return (
			<PropertyRow label="Pull request">
				<ExternalLink
					href={runPr.url}
					className="inline-flex min-w-0 items-center hover:opacity-80"
					title="Open pull request"
				>
					<PrBadge pr={runPr} size="sm" />
				</ExternalLink>
			</PropertyRow>
		)
	}

	return (
		<>
			<PropertyRow label={issuePrs.length === 1 ? 'Pull request' : 'Pull requests'}>
				<span className="flex min-w-0 flex-1 flex-col gap-1">
					{issuePrs.map((pr) => (
						<span
							key={`${pr.repo_slug}#${pr.number}`}
							className="flex min-w-0 items-center gap-1.5 rounded-[4px] border border-(--border-faint) bg-surface/40 px-1.5 py-1"
						>
							<PrBadge pr={pr} size="sm" />
							<span
								className="min-w-0 flex-1 truncate text-[12px] text-fg-muted"
								title={pr.title}
							>
								{pr.title || pr.repo_slug}
							</span>
							<button
								type="button"
								className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] text-fg-dim hover:bg-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-success/40 focus-visible:outline-none"
								aria-label={`View diff for pull request #${pr.number}`}
								title="View diff"
								onClick={() => setSelectedPr(pr)}
							>
								<FileDiff size={13} strokeWidth={1.75} aria-hidden="true" />
							</button>
							<ExternalLink
								href={pr.url}
								className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] text-fg-dim hover:bg-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-success/40 focus-visible:outline-none"
								aria-label={`Open pull request #${pr.number} on GitHub`}
								title="Open on GitHub"
							>
								<ExternalLinkIcon size={13} strokeWidth={1.75} aria-hidden="true" />
							</ExternalLink>
						</span>
					))}
				</span>
			</PropertyRow>
			<IssuePrDiffDrawer
				issue={issue}
				pr={selectedPr}
				open={selectedPr !== null}
				onClose={() => setSelectedPr(null)}
			/>
		</>
	)
}
