import { Icon, Pill } from '@/components/primitives'
import { ResultRowShell } from '@/domains/command/components/ResultRowShell'
import { SectionHeader } from '@/domains/command/components/SectionHeader'
import { JUMP_TO_TARGETS, QUICK_ACTIONS } from '@/lib/commandActions'
import { formatShortDate } from '@/lib/format'
import type { Run } from '@/types'

interface EmptySectionsViewProps {
	needsYou: Run[]
	selectedIdx: number
	onSelect: (idx: number) => void
	onActivate: (target: string) => void
}

export function EmptySectionsView({ needsYou, selectedIdx, onSelect, onActivate }: EmptySectionsViewProps) {
	let idx = 0
	const needsYouSlice = needsYou.slice(0, 2)
	return (
		<div className="flex flex-col py-1">
			{needsYouSlice.length > 0 ? (
				<>
					<SectionHeader title="Needs you" count={needsYouSlice.length} />
					{needsYouSlice.map((run) => {
						const myIdx = idx++
						return (
							<ResultRowShell
								key={`needs:${run.id}`}
								selected={myIdx === selectedIdx}
								onSelect={() => onSelect(myIdx)}
								onActivate={() => onActivate(`/runs/${run.id}`)}
								leading={<Icon name="alert" size={16} className="text-warn" />}
								primary={
									<span>
										<span className="font-mono text-fg">{run.issue_identifier}</span> ·{' '}
										{run.state.replace(/_/g, ' ')}
									</span>
								}
								secondary={`${run.repo_slug} · ${formatShortDate(run.started_at)}`}
								trailing={
									<Pill tone="warn" size="xs" dot>
										needs you
									</Pill>
								}
							/>
						)
					})}
				</>
			) : null}

			<SectionHeader title="Quick actions" />
			{QUICK_ACTIONS.map((action) => {
				const myIdx = idx++
				return (
					<ResultRowShell
						key={action.id}
						selected={myIdx === selectedIdx}
						onSelect={() => onSelect(myIdx)}
						onActivate={() => onActivate(action.target ?? '')}
						leading={<Icon name={action.icon} size={16} className="text-accent" />}
						primary={action.label}
						secondary={action.hint ?? null}
						trailing={
							action.kbdHints ? (
								<span className="font-mono text-[11px] text-fg-dim">
									{action.kbdHints.join(' ')}
								</span>
							) : null
						}
					/>
				)
			})}

			<SectionHeader title="Jump to" />
			{JUMP_TO_TARGETS.map((jump) => {
				const myIdx = idx++
				return (
					<ResultRowShell
						key={jump.id}
						selected={myIdx === selectedIdx}
						onSelect={() => onSelect(myIdx)}
						onActivate={() => onActivate(jump.target)}
						leading={<Icon name={jump.icon} size={16} className="text-fg-muted" />}
						primary={jump.label}
					/>
				)
			})}
		</div>
	)
}
