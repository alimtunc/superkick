import { isRecommendedAgent } from '@/components/launch/pickDefaultAgent'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { Agent, LaunchStepKind } from '@/types'
import { Menu } from '@base-ui/react/menu'
import { Check, ChevronDown } from 'lucide-react'

interface AgentPickerProps {
	value: string | null
	agents: readonly Agent[]
	onChange: (next: string) => void
	recommendedFor: LaunchStepKind
	disabled?: boolean
}

function providerLabel(provider: Agent['provider']) {
	return provider === 'claude' ? 'Claude' : 'Codex'
}

/**
 * SUP-117 — per-step agent picker on the Launch Task launcher. Mirrors the
 * `ModePicker` pattern (Base UI Menu + RadioGroup) so the chat composer and
 * the launcher feel consistent. Marks the recommended default for the step
 * with an inline badge so the operator can see why we pre-selected it.
 */
export function AgentPicker({ value, agents, onChange, recommendedFor, disabled }: AgentPickerProps) {
	const current = agents.find((a) => a.name === value) ?? null
	const tooltip = current
		? `${current.name} — ${providerLabel(current.provider)}${current.model ? ` · ${current.model}` : ''}`
		: 'Select an agent'

	return (
		<Menu.Root>
			<Tooltip label={tooltip}>
				<Menu.Trigger
					disabled={disabled || agents.length === 0}
					aria-label={current ? `Agent: ${current.name}` : 'Select agent'}
					className="font-data hover:bg-carbon-dim flex h-8 w-full items-center justify-between gap-2 rounded-md border border-edge bg-carbon px-3 text-[12px] text-silver focus:border-edge-bright focus:outline-none disabled:opacity-60"
				>
					<span className="truncate">
						{current ? current.name : <span className="text-dim">No agent selected</span>}
					</span>
					<ChevronDown size={12} strokeWidth={1.75} aria-hidden="true" className="text-dim" />
				</Menu.Trigger>
			</Tooltip>
			<Menu.Portal>
				<Menu.Positioner sideOffset={6} align="start" className="z-50">
					<Menu.Popup className="font-data w-72 overflow-hidden rounded-md border border-edge bg-carbon shadow-lg">
						<Menu.RadioGroup
							value={value ?? ''}
							onValueChange={(next) => onChange(next as string)}
						>
							{agents.map((agent) => {
								const recommended = isRecommendedAgent(agent, recommendedFor)
								return (
									<Menu.RadioItem
										key={agent.name}
										value={agent.name}
										className={cn(
											'flex cursor-pointer items-start gap-2 px-3 py-2 outline-none',
											'data-highlighted:bg-carbon-dim data-checked:bg-carbon-dim'
										)}
									>
										<span className="flex-1">
											<span className="flex items-center gap-2">
												<span className="text-[12px] text-fog">{agent.name}</span>
												{recommended ? (
													<span className="font-data bg-carbon-dim rounded border border-edge px-1 py-px text-[9px] tracking-wider text-dim uppercase">
														Recommended
													</span>
												) : null}
											</span>
											<span className="block text-[10px] text-dim">
												{providerLabel(agent.provider)}
												{agent.role ? ` · ${agent.role}` : ''}
												{agent.model ? ` · ${agent.model}` : ''}
											</span>
										</span>
										<Menu.RadioItemIndicator className="mt-0.5 text-fog">
											<Check size={12} strokeWidth={2} aria-hidden="true" />
										</Menu.RadioItemIndicator>
									</Menu.RadioItem>
								)
							})}
						</Menu.RadioGroup>
					</Menu.Popup>
				</Menu.Positioner>
			</Menu.Portal>
		</Menu.Root>
	)
}
