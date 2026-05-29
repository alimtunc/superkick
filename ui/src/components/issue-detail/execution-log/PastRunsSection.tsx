import { ExecSection } from '@/components/issue-detail/execution-log/ExecSection'
import { PastRunRow } from '@/components/issue-detail/execution-log/PastRunRow'
import type { LaunchTaskWithSteps } from '@/types'

interface PastRunsSectionProps {
	past: readonly LaunchTaskWithSteps[]
}

export function PastRunsSection({ past }: PastRunsSectionProps) {
	if (past.length === 0) return null

	return (
		<ExecSection title="Past runs" count={past.length} defaultOpen={false}>
			<ul className="flex flex-col">
				{past.map((entry, index) => (
					<li key={entry.task.id}>
						<PastRunRow entry={entry} last={index === past.length - 1} />
					</li>
				))}
			</ul>
		</ExecSection>
	)
}
