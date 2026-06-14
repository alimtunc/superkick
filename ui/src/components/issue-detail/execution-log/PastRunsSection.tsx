import { ExecSection } from '@/components/issue-detail/execution-log/ExecSection'
import { PastRunRow } from '@/components/issue-detail/execution-log/PastRunRow'
import type { LaunchTaskWithSteps, LinkedRunSummary } from '@/types'

interface PastRunsSectionProps {
	past: readonly LaunchTaskWithSteps[]
	linkedRuns: readonly LinkedRunSummary[]
}

export function PastRunsSection({ past, linkedRuns }: PastRunsSectionProps) {
	if (past.length === 0) return null

	return (
		<ExecSection title="Past runs" count={past.length} defaultOpen={false}>
			<ul className="flex flex-col">
				{past.map((entry, index) => (
					<li key={entry.task.id}>
						<PastRunRow entry={entry} linkedRuns={linkedRuns} last={index === past.length - 1} />
					</li>
				))}
			</ul>
		</ExecSection>
	)
}
