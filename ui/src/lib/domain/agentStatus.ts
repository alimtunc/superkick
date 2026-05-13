import type { AgentStatus } from '@/types'

const BASE_STATUS_COLOR: Record<AgentStatus, string> = {
	starting: 'text-dim',
	running: 'text-cyan',
	completed: 'text-mineral',
	failed: 'text-oxide',
	cancelled: 'text-dim'
}

export const agentStatusColor: Record<AgentStatus, string> = BASE_STATUS_COLOR

export const agentStatusColorPulsing: Record<AgentStatus, string> = {
	...BASE_STATUS_COLOR,
	running: 'text-cyan live-pulse'
}
