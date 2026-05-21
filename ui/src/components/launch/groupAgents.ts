import type { Agent, AgentProvider } from '@/types'

export interface AgentGroup {
	provider: AgentProvider
	label: string
	builtin: readonly Agent[]
	custom: readonly Agent[]
}

const PROVIDER_LABEL: Record<AgentProvider, string> = {
	codex: 'Codex',
	claude: 'Claude'
}

const PROVIDER_ORDER: readonly AgentProvider[] = ['codex', 'claude']

/**
 * Group agents for the picker. Codex appears before Claude (V1 happy path)
 * and built-ins appear before custom inside each provider so the operator
 * lands on the recommended Superkick defaults without scrolling. Providers
 * with no agents are dropped so the menu doesn't render empty sections.
 */
export function groupAgents(agents: readonly Agent[]): readonly AgentGroup[] {
	return PROVIDER_ORDER.flatMap((provider) => {
		const forProvider = agents.filter((a) => a.provider === provider)
		if (forProvider.length === 0) return []
		const builtin = forProvider.filter((a) => a.origin === 'builtin')
		const custom = forProvider.filter((a) => a.origin === 'custom')
		return [
			{
				provider,
				label: PROVIDER_LABEL[provider],
				builtin,
				custom
			}
		]
	})
}
