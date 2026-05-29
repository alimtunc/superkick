import { Fragment } from 'react'

import { AgentPickerGroup } from '@/components/launch/AgentPickerGroup'
import { groupAgents } from '@/components/launch/groupAgents'
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
	const groups = groupAgents(agents)

	return (
		<Menu.Root>
			<Menu.Trigger
				disabled={disabled || empty}
				aria-label={current ? `${label}: ${current.name}` : `Pick ${label} agent`}
				className={cn('select', disabled ? 'opacity-50' : null)}
			>
				<Icon name={icon} size={14} className="ic text-fg-muted" />
				<span className="text-fg-dim">{label}</span>
				<span className={cn('font-medium', dim ? 'text-fg-dim' : 'text-fg')}>{valueText}</span>
				<span className="chev">
					<Icon name="chevDown" size={14} className="ic" />
				</span>
			</Menu.Trigger>
			<MenuPopup align="start" popupClassName="w-72">
				<Menu.RadioGroup value={value ?? ''} onValueChange={(next) => onChange(next as string)}>
					{groups.map((group, index) => (
						<Fragment key={group.provider}>
							{index > 0 ? <div aria-hidden className="mx-2 my-1 h-px bg-border" /> : null}
							<AgentPickerGroup
								label={group.label}
								items={group.builtin}
								badge="Built-in"
								recommendedFor={recommendedFor}
							/>
							<AgentPickerGroup
								label={group.label}
								items={group.custom}
								badge="Custom"
								recommendedFor={recommendedFor}
							/>
						</Fragment>
					))}
				</Menu.RadioGroup>
			</MenuPopup>
		</Menu.Root>
	)
}
