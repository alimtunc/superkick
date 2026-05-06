import { SectionTitle } from '@/components/dashboard/SectionTitle'
import type { LinkedRunSummary } from '@/types'
import { Link } from '@tanstack/react-router'
import { TerminalSquare } from 'lucide-react'

interface IssueTerminalEntryProps {
	latestRun: LinkedRunSummary | null
}

export function IssueTerminalEntry({ latestRun }: IssueTerminalEntryProps) {
	if (!latestRun) return null
	return (
		<section>
			<SectionTitle title="WORKSPACE" />
			<Link
				to="/runs/$runId"
				params={{ runId: latestRun.id }}
				hash="terminal"
				className="font-data flex items-center justify-between gap-3 rounded-md border border-edge bg-graphite px-3 py-2.5 text-[12px] text-silver transition-colors hover:border-edge-bright hover:text-fog focus-visible:ring-2 focus-visible:ring-mineral/40 focus-visible:outline-none"
			>
				<span className="flex items-center gap-2">
					<TerminalSquare size={13} strokeWidth={1.75} aria-hidden="true" />
					Inspect workspace
				</span>
				<span className="text-[10px] text-dim">latest run</span>
			</Link>
		</section>
	)
}
