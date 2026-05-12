import { EmptyState } from '@/components/ui/state-empty'
import type { PullRequest, Run } from '@/types'
import { FileDiff } from 'lucide-react'

interface ChangesTabProps {
	run: Run
	pr: PullRequest | null
}

export function ChangesTab({ run, pr }: ChangesTabProps) {
	if (!pr) {
		return (
			<div className="px-4 py-6">
				<EmptyState
					icon={FileDiff}
					title="No diff yet"
					description={
						run.state === 'completed' || run.state === 'failed'
							? 'No pull request was opened for this run.'
							: 'Diff will appear once the run opens a pull request.'
					}
				/>
			</div>
		)
	}

	return (
		<div className="space-y-3 px-4 py-3">
			<div className="rounded-md border border-border bg-canvas/40 p-3">
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
				<p className="font-data mt-2 text-[11.5px] text-fg-dim">
					Detailed file-level diffs land here once the changes endpoint is wired.
				</p>
			</div>
		</div>
	)
}
