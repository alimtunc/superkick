import { AgentAvatarBadge } from '@/components/agents/AgentAvatarBadge'
import { SettingsRow } from '@/components/settings/SettingsRow'
import { Button } from '@/components/ui/button'
import { Pill } from '@/components/ui/pill'
import { isDeletableAgent } from '@/lib/agents'
import { EXECUTOR_LABEL, REASONING_LABEL } from '@/lib/launchConfigOptions'
import type { Agent } from '@/types'
import { Link } from '@tanstack/react-router'

interface AgentRowProps {
	agent: Agent
	busy: boolean
	onDelete: () => void
	last: boolean
}

export function AgentRow({ agent, busy, onDelete, last }: AgentRowProps) {
	const technical = `${agent.role ?? 'agent'} · ${EXECUTOR_LABEL[agent.executor]} · ${REASONING_LABEL[agent.default_reasoning]}${agent.model ? ` · ${agent.model}` : ''}`
	const hint = agent.description ?? technical

	return (
		<SettingsRow
			label={agent.name}
			hint={hint}
			last={last}
			leading={<AgentAvatarBadge avatar={agent.avatar} name={agent.name} size={28} />}
		>
			<div className="flex items-center gap-2">
				<Pill tone={agent.origin === 'custom' ? 'accent' : 'neutral'}>{agent.origin}</Pill>
				<Pill tone={agent.enabled ? 'accent' : 'neutral'}>
					{agent.enabled ? 'enabled' : 'disabled'}
				</Pill>
				<Button
					variant="ghost"
					size="sm"
					render={<Link to="/agents/$agentId" params={{ agentId: agent.name }} />}
				>
					Open
				</Button>
				{isDeletableAgent(agent) ? (
					<Button variant="ghost" size="sm" disabled={busy} onClick={onDelete}>
						Delete
					</Button>
				) : null}
			</div>
		</SettingsRow>
	)
}
