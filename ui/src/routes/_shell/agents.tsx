import { useMemo } from 'react'

import { AgentCard } from '@/components/agents/AgentCard'
import { AGENTS_FIXTURE } from '@/components/agents/agentsFixture'
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
	const { running, total } = useMemo(() => {
		const runningCount = AGENTS_FIXTURE.filter((agent) => agent.status === 'active').length
		return { running: runningCount, total: AGENTS_FIXTURE.length }
	}, [])

	const right = useMemo(
		() => (
			<div className="flex items-center gap-2">
				<span className="pill pill--accent">
					<span className="agdot agdot--running" />
					{running} / {total} running
				</span>
				<Btn kind="primary" size="sm" icon="plus">
					New agent
				</Btn>
			</div>
		),
		[running, total]
	)

	usePageActions({ right })

	return (
		<div className="px-6 py-6">
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
				{AGENTS_FIXTURE.map((agent) => (
					<AgentCard
						key={agent.id}
						id={agent.id}
						name={agent.name}
						role={agent.role}
						model={agent.model}
						runs={agent.runs}
						success={agent.success}
						sparkline={agent.sparkline}
						tags={agent.tags}
						tone={agent.tone}
						status={agent.status}
					/>
				))}
			</div>
		</div>
	)
}
