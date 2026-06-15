import { PrBadge } from '@/components/pr/PrBadge'
import type { PrInboxItem } from '@/types'
import { Link } from '@tanstack/react-router'

interface PrRowProps {
	pr: PrInboxItem
}

export function PrRow({ pr }: PrRowProps) {
	return (
		<Link
			to="/reviews/$number"
			params={{ number: String(pr.number) }}
			className="flex items-center gap-2 border-b border-(--border-faint) px-4 py-2 text-[13px] hover:bg-surface data-[status=active]:bg-surface data-[status=active]:[box-shadow:inset_2px_0_0_0_var(--accent)]"
		>
			<PrBadge pr={{ number: pr.number, url: pr.url, state: pr.state }} size="xs" />
			<span className="min-w-0 flex-1 truncate text-fg">{pr.title}</span>
			{pr.linkedIssueIdentifier ? (
				<span className="mono shrink-0 text-[11px] text-fg-dim">{pr.linkedIssueIdentifier}</span>
			) : null}
			<span className="mono shrink-0 truncate text-[11px] text-fg-dim">{pr.headBranch}</span>
			<span className="shrink-0 text-[11px] text-fg-muted">{pr.author}</span>
			{pr.reviewers.length > 0 ? (
				<span className="shrink-0 text-[11px] text-fg-dim" title="Reviewers">
					{pr.reviewers.map((reviewer) => reviewer.login).join(', ')}
				</span>
			) : null}
		</Link>
	)
}
