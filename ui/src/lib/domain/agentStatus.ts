import type { AgentStatus } from '@/types'

const BASE_STATUS_COLOR: Record<AgentStatus, string> = {
	starting: 'text-fg-dim',
	running: 'text-info',
	completed: 'text-success',
	failed: 'text-danger',
	cancelled: 'text-fg-dim'
}

export const agentStatusColor: Record<AgentStatus, string> = BASE_STATUS_COLOR

export const agentStatusColorPulsing: Record<AgentStatus, string> = {
	...BASE_STATUS_COLOR,
	running: 'text-info live-pulse'
}
