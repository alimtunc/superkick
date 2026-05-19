import { isRecommendedAgent } from '@/components/launch/pickDefaultAgent'
import { MenuPopup } from '@/components/ui/menu-shell'
import { cn } from '@/lib/utils'
import type { Agent, LaunchStepKind } from '@/types'
import type { SKIconName } from '@/types/icons'
import { Icon } from '@/ui/Icon'
import { Menu } from '@base-ui/react/menu'

interface AgentPickerProps {
	value: string | null
	agents: readonly Agent[]
	onChange: (next: string) => void
	recommendedFor: LaunchStepKind
	icon: SKIconName
	label: string
	disabled?: boolean
}

function providerLabel(provider: Agent['provider']) {
	return provider === 'claude' ? 'Claude' : 'Codex'
}

export function AgentPicker({
	value,
	agents,
	onChange,
	recommendedFor,
	icon,
	label,
	disabled
}: AgentPickerProps) {
	const current = agents.find((a) => a.name === value) ?? null
	const empty = agents.length === 0
	const valueText = current?.name ?? (empty ? 'no agents' : 'choose…')
	const dim = current === null

	return (
		<Menu.Root>
			<Menu.Trigger
				disabled={disabled || empty}
				aria-label={current ? `${label}: ${current.name}` : `Pick ${label} agent`}
				className={cn(
					'inline-flex items-center gap-[7px] rounded-[7px] border border-transparent bg-raised px-2.5 py-[5px] text-[12.5px] transition-colors',
					'focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none',
					'hover:border-border-strong',
					disabled ? 'opacity-50' : null
				)}
			>
				<Icon name={icon} size={13} className="text-fg-muted" />
				<span className="text-fg-dim">{label}</span>
				<span className={cn('font-medium', dim ? 'text-fg-dim' : 'text-fg')}>{valueText}</span>
				<Icon name="chevDown" size={11} className="text-fg-dim" />
			</Menu.Trigger>
			<MenuPopup align="start" popupClassName="w-72">
				<Menu.RadioGroup value={value ?? ''} onValueChange={(next) => onChange(next as string)}>
					{agents.map((agent) => {
						const recommended = isRecommendedAgent(agent, recommendedFor)
						return (
							<Menu.RadioItem
								key={agent.name}
								value={agent.name}
								className={cn(
									'flex cursor-pointer items-start gap-2 px-3 py-2 text-[12.5px] outline-none',
									'data-highlighted:bg-raised data-checked:bg-raised'
								)}
							>
								<span className="flex-1">
									<span className="flex items-center gap-2">
										<span className="text-fg">{agent.name}</span>
										{recommended ? (
											<span className="rounded border border-border bg-raised px-1 py-px font-mono text-[9px] tracking-wider text-fg-dim uppercase">
												Recommended
											</span>
										) : null}
									</span>
									<span className="block text-[10.5px] text-fg-dim">
										{providerLabel(agent.provider)}
										{agent.role ? ` · ${agent.role}` : ''}
										{agent.model ? ` · ${agent.model}` : ''}
									</span>
								</span>
								<Menu.RadioItemIndicator className="mt-0.5 text-fg">
									<Icon name="check" size={13} />
								</Menu.RadioItemIndicator>
							</Menu.RadioItem>
						)
					})}
				</Menu.RadioGroup>
			</MenuPopup>
		</Menu.Root>
	)
}
