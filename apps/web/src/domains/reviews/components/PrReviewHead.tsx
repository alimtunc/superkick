import { ExternalLink } from '@/components/composites/external-link'
import { Icon, Pill } from '@/components/primitives'
import { PrBadge } from '@/domains/reviews/components/pr/PrBadge'
import type { PrInboxItem, PrReviewTab } from '@/types'
import { Link } from '@tanstack/react-router'

import { CopyLinkButton } from './CopyLinkButton'
import { REVIEW_CHIP_CLASS, reviewPanelId, reviewTabId } from './reviewChrome'
import { prReviewStatus } from './reviewStatus'

interface PrReviewHeadProps {
	pr: PrInboxItem
	diffStats: { additions: number; deletions: number } | null
	tab: PrReviewTab
	onTabChange: (tab: PrReviewTab) => void
}

const TABS: { id: PrReviewTab; label: string }[] = [
	{ id: 'activity', label: 'Activity' },
	{ id: 'diff', label: 'Diff' }
]

export function PrReviewHead({ pr, diffStats, tab, onTabChange }: PrReviewHeadProps) {
	const status = prReviewStatus(pr)
	return (
		<header className="shrink-0 border-b border-border px-5 py-3">
			<div className="flex items-start gap-3">
				<div className="min-w-0 flex-1">
					<div className="mb-1 flex items-center gap-2 text-[12px] text-fg-dim">
						<Link to="/reviews" className="hover:text-fg">
							Reviews
						</Link>
						<span aria-hidden="true">/</span>
						<PrBadge pr={{ number: pr.number, url: pr.url, state: pr.state }} size="xs" />
						<Pill tone={status.tone} size="xs" dot>
							{status.label}
						</Pill>
					</div>
					<div className="flex items-center gap-2">
						<ExternalLink
							href={pr.url}
							className="min-w-0 truncate text-[15px] font-semibold text-fg hover:underline"
						>
							{pr.title}
						</ExternalLink>
						{diffStats && (diffStats.additions > 0 || diffStats.deletions > 0) ? (
							<span className="mono shrink-0 text-[12px]">
								<span className="text-success">+{diffStats.additions}</span>{' '}
								<span className="text-danger">−{diffStats.deletions}</span>
							</span>
						) : null}
					</div>
					<div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-fg-dim">
						<span className="mono break-all">{pr.repoSlug}</span>
						<span aria-hidden="true">·</span>
						<span className="mono break-all">
							{pr.baseBranch} ← {pr.headBranch}
						</span>
						<span aria-hidden="true">·</span>
						<span>{pr.author}</span>
						{pr.linkedIssueIdentifier ? (
							<>
								<span aria-hidden="true">·</span>
								<span className="mono">{pr.linkedIssueIdentifier}</span>
							</>
						) : null}
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-1">
					<CopyLinkButton url={pr.url} />
					<ExternalLink href={pr.url} className={REVIEW_CHIP_CLASS}>
						<Icon name="external" size={12} className="ic" />
						GitHub
					</ExternalLink>
				</div>
			</div>

			<div className="mt-3 flex items-center gap-1" role="tablist" aria-label="Review view">
				{TABS.map((entry) => (
					<button
						key={entry.id}
						type="button"
						role="tab"
						id={reviewTabId(entry.id)}
						aria-selected={tab === entry.id}
						aria-controls={reviewPanelId(entry.id)}
						data-active={tab === entry.id}
						onClick={() => onTabChange(entry.id)}
						className="rounded-[5px] px-2.5 py-1 text-[12px] text-fg-dim transition-colors hover:text-fg data-[active=true]:bg-surface data-[active=true]:text-fg"
					>
						{entry.label}
					</button>
				))}
			</div>
		</header>
	)
}
