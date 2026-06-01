import type { Agent } from '@/types'

import { getJson } from './_shared'

export async function listAgents(): Promise<Agent[]> {
	const body = await getJson<{ agents: Agent[] }>('/agents', 'list agents failed')
	return body.agents
}
