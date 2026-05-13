import type { Agent } from '@/types'

import { BASE, throwGenericApiError } from './_shared'

export async function listAgents(): Promise<Agent[]> {
	const res = await fetch(`${BASE}/agents`)
	if (!res.ok) await throwGenericApiError(res, 'list agents failed')
	const body = (await res.json()) as { agents: Agent[] }
	return body.agents
}
