import { Pill } from '@/components/ui/pill'
import type { Run } from '@/types'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight, MessagesSquare } from 'lucide-react'

interface RunInspectorParentBannerProps {
	run: Run
}

export function RunInspectorParentBanner({ run }: RunInspectorParentBannerProps) {
	return (
		<div className="bg-carbon-dim/40 flex items-center gap-3 border-b border-edge px-6 py-2.5">
			<MessagesSquare
				size={13}
				strokeWidth={1.75}
				className="shrink-0 text-fg-dim"
				aria-hidden="true"
			/>
			<span className="text-[12px] text-fg-muted">Decisions for this run live on its issue</span>
			<Link
				to="/issues/$issueId"
				params={{ issueId: run.issue_identifier }}
				className="ml-auto inline-flex items-center gap-1 rounded-md focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
				aria-label={`Open parent issue ${run.issue_identifier}`}
				title={`Open parent issue ${run.issue_identifier}`}
			>
				<Pill mono size="xs" interactive>
					{run.issue_identifier}
				</Pill>
				<ArrowUpRight size={12} strokeWidth={1.85} className="text-fg-dim" aria-hidden="true" />
			</Link>
		</div>
	)
}
