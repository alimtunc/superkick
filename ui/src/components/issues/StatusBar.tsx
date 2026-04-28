import { ISSUE_STATE_ORDER, issueStateAccent } from '@/lib/domain'
import type { IssueState } from '@/types'

interface StatusBarProps {
	counts: Record<IssueState, number>
	total: number
}

export function StatusBar({ counts, total }: StatusBarProps) {
	if (total === 0) return null

	const segments = ISSUE_STATE_ORDER.map((state) => ({
		state,
		count: counts[state],
		accent: issueStateAccent[state]
	})).filter((s) => s.count > 0)

	return (
		<div>
			<div className="mb-2 flex h-2 overflow-hidden rounded-sm">
				{segments.map((s) => (
					<div
						key={s.state}
						className={`h-full ${s.accent.dot}`}
						style={{
							width: `${(s.count / total) * 100}%`,
							opacity: 0.7
						}}
					/>
				))}
			</div>
			<div className="flex flex-wrap gap-x-4 gap-y-1">
				{segments.map((s) => (
					<span key={s.state} className="flex items-center gap-1.5">
						<span className={`inline-block h-2 w-2 rounded-sm ${s.accent.dot}`} />
						<span className="font-data text-[10px] text-dim">
							{s.accent.label} {s.count}
						</span>
					</span>
				))}
			</div>
		</div>
	)
}
