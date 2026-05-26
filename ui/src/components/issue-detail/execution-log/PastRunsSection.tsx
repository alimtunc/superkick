import { ExecSection } from '@/components/issue-detail/execution-log/ExecSection'
import { PastRunRow } from '@/components/issue-detail/execution-log/PastRunRow'
import type { LaunchTaskWithSteps } from '@/types'

interface PastRunsSectionProps {
	past: readonly LaunchTaskWithSteps[]
}

export function PastRunsSection({ past }: PastRunsSectionProps) {
	if (past.length === 0) return null
	return (
		<ExecSection id="exec-past-runs" label="Past runs" count={past.length} defaultOpen={false}>
			<ul className="-mt-0.5">
				{past.map((entry) => (
					<li key={entry.task.id}>
						<PastRunRow entry={entry} />
					</li>
				))}
			</ul>
		</ExecSection>
	)
}
