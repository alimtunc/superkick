import { ISSUE_STATE_ORDER, issueStateAccent, issueStateTone } from '@/lib/domain'
import type { IssueState } from '@/types'
import { Dot } from '@/ui/Dot'

interface StatusBarProps {
	counts: Record<IssueState, number>
	total: number
}

const STATE_SEGMENT_BG: Record<IssueState, string> = {
	open: 'bg-fg-dim',
	in_progress: 'bg-info',
	needs_human: 'bg-warn',
	in_review: 'bg-accent',
	done: 'bg-success'
}

export function StatusBar({ counts, total }: StatusBarProps) {
	if (total === 0) return null

	const segments = ISSUE_STATE_ORDER.map((state) => ({
		state,
		count: counts[state]
	})).filter((s) => s.count > 0)

	return (
		<div>
			<div className="mb-2 flex h-1.5 overflow-hidden rounded-sm">
				{segments.map((s) => (
					<div
						key={s.state}
						className={`h-full ${STATE_SEGMENT_BG[s.state]}`}
						style={{
							width: `${(s.count / total) * 100}%`,
							opacity: 0.75
						}}
					/>
				))}
			</div>
			<div className="flex flex-wrap gap-x-4 gap-y-1">
				{segments.map((s) => (
					<span key={s.state} className="flex items-center gap-1.5">
						<Dot tone={issueStateTone[s.state]} size={6} />
						<span className="font-mono text-[10px] text-fg-dim">
							{issueStateAccent[s.state].label} {s.count}
						</span>
					</span>
				))}
			</div>
		</div>
	)
}
