import { useMemo } from 'react'

import { AgentCard } from '@/components/agents/AgentCard'
import { AGENTS_FIXTURE } from '@/components/agents/agentsFixture'
import { Pill } from '@/components/ui/pill'
import { usePageActions } from '@/shell/usePageActions'
import { Btn } from '@/ui/Btn'
import { createRoute } from '@tanstack/react-router'

import { Route as shellRoute } from './route'

export const Route = createRoute({
	getParentRoute: () => shellRoute,
	path: '/agents',
	component: AgentsPage
})

function AgentsPage() {
	const { active, paused, activeAgents } = useMemo(() => {
		const activeList = AGENTS_FIXTURE.filter((agent) => agent.status === 'active')
		const pausedCount = AGENTS_FIXTURE.length - activeList.length
		return { active: activeList.length, paused: pausedCount, activeAgents: activeList }
	}, [])

	const sub = useMemo(
		() => (
			<Pill tone="neutral" mono size="xs">
				{active} active · {paused} paused
			</Pill>
		),
		[active, paused]
	)

	const right = useMemo(
		() => (
			<div className="flex items-center gap-2">
				<Btn kind="ghost" size="sm" icon="filter">
					All teams
				</Btn>
				<Btn kind="primary" size="sm" icon="plus">
					New agent
				</Btn>
			</div>
		),
		[]
	)

	usePageActions({ sub, right })

	return (
		<div className="px-6 py-6">
			<div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
				{activeAgents.map((agent) => (
					<AgentCard
						key={agent.id}
						name={agent.name}
						role={agent.role}
						model={agent.model}
						runs={agent.runs}
						success={agent.success}
						sparkline={agent.sparkline}
						tags={agent.tags}
						tone={agent.tone}
					/>
				))}
			</div>
		</div>
	)
}
