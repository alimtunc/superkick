import type { PullRequest } from '@/types'

interface PullRequestHeaderProps {
	pr: PullRequest
}

export function PullRequestHeader({ pr }: PullRequestHeaderProps) {
	return (
		<div className="border-b border-border px-4 py-3">
			<div className="flex items-center justify-between gap-2">
				<a
					href={pr.url}
					target="_blank"
					rel="noopener noreferrer"
					className="font-data text-[12px] text-accent hover:underline focus-visible:outline-none"
				>
					#{pr.number} · {pr.title}
				</a>
				<span className="font-data text-[11px] text-fg-dim">{pr.state}</span>
			</div>
		</div>
	)
}
