import { StatusIcon } from '@/components/issues/StatusIcon'
import { Pill } from '@/components/ui/pill'
import type { IssueBlockerRef } from '@/types'

interface LaunchQueueBlockerListProps {
	blockers: IssueBlockerRef[]
}

export function LaunchQueueBlockerList({ blockers }: LaunchQueueBlockerListProps) {
	if (blockers.length === 0) return null
	return (
		<ul className="flex flex-wrap gap-1">
			{blockers.map((blocker) => (
				<li key={blocker.id}>
					<Pill
						tone="neutral"
						size="xs"
						mono
						title={blocker.status.name}
						leading={
							<StatusIcon stateType={blocker.status.state_type} color={blocker.status.color} />
						}
					>
						{blocker.identifier}
					</Pill>
				</li>
			))}
		</ul>
	)
}
