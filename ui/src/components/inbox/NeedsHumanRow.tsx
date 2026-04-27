import { NEEDS_HUMAN_REASON_LABEL, NEEDS_HUMAN_REASON_TONE } from '@/lib/inbox/needsHuman'
import type { NeedsHumanItem } from '@/types'
import { Link } from '@tanstack/react-router'

interface NeedsHumanRowProps {
	item: NeedsHumanItem
}

/**
 * One-line urgent-attention row. Routes to the run detail when the source
 * is a run, to the issue detail when the source is an unstarted issue
 * (approval bucket).
 */
export function NeedsHumanRow({ item }: NeedsHumanRowProps) {
	const tag = (
		<span
			className={`font-data inline-block rounded px-1.5 py-0.5 text-[9px] tracking-wider uppercase ${NEEDS_HUMAN_REASON_TONE[item.reasonKind]}`}
		>
			{NEEDS_HUMAN_REASON_LABEL[item.reasonKind]}
		</span>
	)

	if (item.source.kind === 'launch-issue') {
		const issue = item.source.item.issue
		return (
			<Link
				to="/issues/$issueId"
				params={{ issueId: issue.id }}
				className="flex items-center gap-3 px-3 py-2 transition-colors hover:bg-slate-deep/50"
			>
				{tag}
				<span className="font-data shrink-0 text-[11px] font-medium text-fog">
					{issue.identifier}
				</span>
				<span className="font-data flex-1 truncate text-[10px] text-silver">{item.reason}</span>
			</Link>
		)
	}

	const run = item.source.run
	return (
		<Link
			to="/runs/$runId"
			params={{ runId: run.id }}
			className="flex items-center gap-3 px-3 py-2 transition-colors hover:bg-slate-deep/50"
		>
			{tag}
			<span className="font-data shrink-0 text-[11px] font-medium text-fog">
				{run.issue_identifier}
			</span>
			<span className="font-data flex-1 truncate text-[10px] text-silver">{item.reason}</span>
		</Link>
	)
}
