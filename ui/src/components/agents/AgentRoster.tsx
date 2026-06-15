import { useState } from 'react'

import { AgentEditor } from '@/components/agents/AgentEditor'
import { AgentRow } from '@/components/agents/AgentRow'
import { SettingsPaneHeader } from '@/components/settings/SettingsPaneHeader'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { Button } from '@/components/ui/button'
import { AsyncSection } from '@/components/ui/state-async'
import { useAgentMutations, useAgents } from '@/hooks/useAgents'
import { blankAgent } from '@/lib/agents'
import { providerLabel } from '@/lib/domain'
import type { Agent, AgentProvider, ManagedAgent } from '@/types'
import { toast } from 'sonner'

const PROVIDER_ORDER: AgentProvider[] = ['codex', 'claude']

export function AgentRoster() {
	const { data: agents = [], isLoading, error } = useAgents()
	const { createAgent, deleteAgent, isMutating } = useAgentMutations()
	const [createOpen, setCreateOpen] = useState(false)

	const errorMessage = error ? error.message : null

	const groups: { provider: AgentProvider; agents: Agent[] }[] = PROVIDER_ORDER.map((provider) => ({
		provider,
		agents: agents.filter((agent) => agent.provider === provider)
	})).filter((group) => group.agents.length > 0)

	async function handleDelete(name: string) {
		try {
			await deleteAgent(name)
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to delete agent')
		}
	}

	async function handleCreate(agent: ManagedAgent) {
		try {
			await createAgent(agent)
			setCreateOpen(false)
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to create agent')
		}
	}

	return (
		<section>
			<SettingsPaneHeader
				title="Agents"
				description="App-managed agents — reusable execution units (provider, model, reasoning, instructions, MCP/tool policy). Built-ins can be edited and disabled but not deleted; create your own custom agents."
			/>
			<AsyncSection
				isLoading={isLoading}
				error={errorMessage}
				isEmpty={agents.length === 0}
				emptyTitle="No agents yet"
			>
				{groups.map((group) => (
					<SettingsSection key={group.provider} title={providerLabel[group.provider]}>
						{group.agents.map((agent, index) => (
							<AgentRow
								key={agent.name}
								agent={agent}
								busy={isMutating}
								onDelete={() => handleDelete(agent.name)}
								last={index === group.agents.length - 1}
							/>
						))}
					</SettingsSection>
				))}
			</AsyncSection>
			<div className="flex flex-wrap gap-2">
				<Button size="sm" onClick={() => setCreateOpen(true)}>
					New agent
				</Button>
			</div>
			{createOpen ? (
				<AgentEditor
					open={createOpen}
					seed={blankAgent()}
					mode="create"
					busy={isMutating}
					onOpenChange={(open) => {
						if (!open) setCreateOpen(false)
					}}
					onSubmit={handleCreate}
				/>
			) : null}
		</section>
	)
}
