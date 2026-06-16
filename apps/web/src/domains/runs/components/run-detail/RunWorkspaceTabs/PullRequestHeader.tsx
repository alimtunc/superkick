import { ExternalLink } from '@/components/composites/external-link'
import type { PullRequest } from '@/types'

interface PullRequestHeaderProps {
	pr: PullRequest
}

export function PullRequestHeader({ pr }: PullRequestHeaderProps) {
	return (
		<div className="border-b border-border px-4 py-3">
			<div className="flex items-center justify-between gap-2">
				<ExternalLink
					href={pr.url}
					className="font-data text-[12px] text-accent hover:underline focus-visible:outline-none"
				>
					#{pr.number} · {pr.title}
				</ExternalLink>
				<span className="font-data text-[11px] text-fg-dim">{pr.state}</span>
			</div>
		</div>
	)
}
