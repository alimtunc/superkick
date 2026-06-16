import type { Agent, ManagedAgent, ProfileUsage } from '@/types'

import { deleteVoid, getJson, patchJson, postJson } from './_shared'

export async function restoreAgent(name: string): Promise<ManagedAgent> {
	return postJson(`/agents/${name}/restore`, 'restore agent failed')
}

export async function listAgents(): Promise<Agent[]> {
	const body = await getJson<{ agents: Agent[] }>('/agents', 'list agents failed')
	return body.agents
}

export async function getAgent(name: string): Promise<ManagedAgent> {
	return getJson(`/agents/${name}`, 'get agent failed')
}

export async function createAgent(agent: ManagedAgent): Promise<ManagedAgent> {
	return postJson('/agents', 'create agent failed', agent)
}

export async function updateAgent(name: string, agent: ManagedAgent): Promise<ManagedAgent> {
	return patchJson(`/agents/${name}`, 'update agent failed', agent)
}

export async function deleteAgent(name: string): Promise<void> {
	return deleteVoid(`/agents/${name}`, 'delete agent failed')
}

export async function fetchAgentUsages(name: string): Promise<ProfileUsage[]> {
	return getJson(`/agents/${name}/usages`, 'fetch agent usages failed')
}
