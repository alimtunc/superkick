import { Icon } from '@/components/primitives'
import { isRecommendedAgent } from '@/domains/launch/components/pickDefaultAgent'
import { cn } from '@/lib/utils'
import type { Agent, LaunchStepKind } from '@/types'
import { Menu } from '@base-ui/react/menu'

interface AgentPickerItemProps {
	agent: Agent
	recommendedFor: LaunchStepKind
}

export function AgentPickerItem({ agent, recommendedFor }: AgentPickerItemProps) {
	const recommended = isRecommendedAgent(agent, recommendedFor)
	return (
		<Menu.RadioItem
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
					{agent.role ?? '—'}
					{agent.model ? ` · ${agent.model}` : ''}
				</span>
			</span>
			<Menu.RadioItemIndicator className="mt-0.5 text-fg">
				<Icon name="check" size={13} />
			</Menu.RadioItemIndicator>
		</Menu.RadioItem>
	)
}
