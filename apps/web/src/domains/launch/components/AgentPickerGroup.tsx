import { AgentPickerItem } from '@/domains/launch/components/AgentPickerItem'
import type { Agent, LaunchStepKind } from '@/types'

interface AgentPickerGroupProps {
	label: string
	items: readonly Agent[]
	badge: 'Built-in' | 'Custom'
	recommendedFor: LaunchStepKind
}

export function AgentPickerGroup({ label, items, badge, recommendedFor }: AgentPickerGroupProps) {
	if (items.length === 0) return null
	const heading = `${label} · ${badge}`
	return (
		<div role="group" aria-label={heading}>
			<div
				aria-hidden
				className="px-3 pt-2 pb-1 font-mono text-[9.5px] tracking-wider text-fg-dim uppercase"
			>
				{heading}
			</div>
			{items.map((agent) => (
				<AgentPickerItem key={agent.name} agent={agent} recommendedFor={recommendedFor} />
			))}
		</div>
	)
}
