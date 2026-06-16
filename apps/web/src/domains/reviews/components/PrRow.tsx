import { Pill } from '@/components/primitives'
import { PrBadge } from '@/domains/reviews/components/pr/PrBadge'
import { fmtRelativeTime } from '@/lib/domain'
import type { PrInboxItem } from '@/types'
import { Link } from '@tanstack/react-router'

import { PrChecksBadge } from './PrChecksBadge'
import { prReviewStatus } from './reviewStatus'

interface PrRowProps {
	pr: PrInboxItem
}

export function PrRow({ pr }: PrRowProps) {
	const status = prReviewStatus(pr)
	const reviewerCount = pr.reviewers.length
	return (
		<Link
			to="/reviews/$number"
			params={{ number: String(pr.number) }}
			className="flex min-w-0 flex-col gap-1.5 border-b border-(--border-faint) px-4 py-3 hover:bg-surface data-[status=active]:bg-surface data-[status=active]:[box-shadow:inset_2px_0_0_0_var(--accent)]"
		>
			<div className="flex items-center gap-2">
				<PrBadge pr={{ number: pr.number, url: pr.url, state: pr.state }} size="xs" />
				<Pill tone={status.tone} size="xs" dot>
					{status.label}
				</Pill>
				<span className="ml-auto shrink-0 text-[11px] text-fg-muted" title={pr.updatedAt}>
					{fmtRelativeTime(pr.updatedAt)}
				</span>
			</div>

			<p className="line-clamp-2 text-[13px] leading-snug font-medium text-fg" title={pr.title}>
				{pr.title}
			</p>

			<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-fg-dim">
				{pr.linkedIssueIdentifier ? (
					<span className="mono shrink-0 text-fg-muted">{pr.linkedIssueIdentifier}</span>
				) : null}
				<span className="mono flex min-w-0 items-center gap-1">
					<span className="truncate" title={pr.repoSlug}>
						{pr.repoSlug}
					</span>
					<span aria-hidden="true">·</span>
					<span className="truncate" title={pr.headBranch}>
						{pr.headBranch}
					</span>
				</span>
				<span className="shrink-0">{pr.author}</span>
				{reviewerCount > 0 ? (
					<span
						className="shrink-0"
						title={pr.reviewers.map((reviewer) => reviewer.login).join(', ')}
					>
						{reviewerCount} reviewer{reviewerCount === 1 ? '' : 's'}
					</span>
				) : null}
				{pr.checks ? (
					<span className="ml-auto shrink-0">
						<PrChecksBadge checks={pr.checks} />
					</span>
				) : null}
			</div>
		</Link>
	)
}
