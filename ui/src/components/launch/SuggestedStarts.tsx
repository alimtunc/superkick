import { useLaunchQueue } from '@/hooks/useLaunchQueue'
import type { LaunchQueueItem } from '@/types'
import { Icon } from '@/ui/Icon'
import { Link } from '@tanstack/react-router'

const MAX = 3

function pickSuggestions(items: readonly LaunchQueueItem[]) {
	return items
		.filter((item): item is Extract<LaunchQueueItem, { kind: 'issue' }> => item.kind === 'issue')
		.slice(0, MAX)
}

export function SuggestedStarts() {
	const launchQueue = useLaunchQueue()
	const suggestions = pickSuggestions(launchQueue.groups['launchable'] ?? [])
	if (suggestions.length === 0) return null

	return (
		<section className="mt-6 flex flex-col gap-2">
			<div className="pl-1 text-[11px] font-semibold tracking-wider text-fg-dim uppercase">
				Suggested starts
			</div>
			{suggestions.map((item) => (
				<Link
					key={item.issue.id}
					to="/tasks/new"
					search={{ issue: item.issue.identifier }}
					className="group flex items-center gap-3 rounded-[9px] border border-border bg-surface px-3.5 py-3 transition-colors hover:border-border-strong"
				>
					<Icon name="issue" size={15} className="text-fg-muted" />
					<div className="flex min-w-0 flex-1 flex-col gap-0.5">
						<span className="truncate text-[13px] font-medium text-fg">{item.issue.title}</span>
						<span className="truncate text-[11.5px] text-fg-dim">
							{item.issue.identifier}
							{item.issue.priority.label ? ` · ${item.issue.priority.label}` : ''}
							{item.reason ? ` · ${item.reason}` : ''}
						</span>
					</div>
					<Icon name="arrowRight" size={14} className="text-fg-dim" />
				</Link>
			))}
		</section>
	)
}
