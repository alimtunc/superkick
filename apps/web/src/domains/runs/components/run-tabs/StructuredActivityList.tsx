import { Icon } from '@/components/primitives'
import { ActivityDelta } from '@/domains/runs/components/run-tabs/ActivityDelta'
import { ActivityDiffBlock } from '@/domains/runs/components/run-tabs/ActivityDiffBlock'
import { ActivityStatusBadge } from '@/domains/runs/components/run-tabs/ActivityStatusBadge'
import { ActivityTestOutput } from '@/domains/runs/components/run-tabs/ActivityTestOutput'
import { activityPayload, type ActivityPayload } from '@/domains/runs/components/run-tabs/structuredActivity'
import { iconFor, nodeToneClass } from '@/domains/runs/components/run-tabs/structuredActivityView'
import { fmtDuration } from '@/lib/domain'
import { cn } from '@/lib/utils'
import type { RunEvent } from '@/types'

interface StructuredActivityListProps {
	events: readonly RunEvent[]
	className?: string
}

export function StructuredActivityList({ events, className }: StructuredActivityListProps) {
	const rows = events
		.map((event) => ({ event, payload: activityPayload(event) }))
		.filter((row): row is { event: RunEvent; payload: ActivityPayload } => row.payload !== null)
	const baseTs = rows[0] ? new Date(rows[0].event.ts).getTime() : 0

	return (
		<ol className={cn('feed', className)}>
			{rows.map(({ event, payload }) => {
				const elapsedMs = Math.max(0, new Date(event.ts).getTime() - baseTs)
				const tone = nodeToneClass(event, payload)
				return (
					<li key={event.id} className="feeditem">
						<span className="feeditem__node">
							<span className={`node-glyph ${tone}`}>
								<Icon name={iconFor(payload)} size={13} className="ic" />
							</span>
						</span>
						<div className="flex min-w-0 items-center gap-2">
							<span className="truncate text-[13px] font-medium text-fg">{event.message}</span>
							<ActivityStatusBadge payload={payload} />
							<ActivityDelta changed={payload.changed} />
							<span className="font-data ml-auto shrink-0 text-[10.5px] text-fg-dim">
								{fmtDuration(elapsedMs)}
							</span>
						</div>
						{payload.detail ? (
							<p className="mt-1 text-[12px] text-fg-muted">
								{payload.detail}
								{payload.file ? (
									<>
										{' '}
										<span className="font-mono font-semibold text-fg">
											{payload.file}
										</span>
									</>
								) : null}
							</p>
						) : null}
						<ActivityTestOutput tests={payload.tests} />
						<ActivityDiffBlock payload={payload} />
					</li>
				)
			})}
		</ol>
	)
}
