import type { PillTone } from '@/components/ui/pill'
import type { AgentProvider, RunState } from '@/types'

export const providerLabel: Record<AgentProvider, string> = {
	claude: 'Claude',
	codex: 'Codex'
}

export function resolveProviderLabel(provider: string | null | undefined): string | null {
	if (!provider) return null
	if (provider === 'claude' || provider === 'codex') return providerLabel[provider]
	return provider
}

export const stepLabel: Record<string, string> = {
	prepare: 'Prepare',
	plan: 'Plan',
	code: 'Code',
	commands: 'Commands',
	review_swarm: 'Review',
	create_pr: 'PR',
	await_human: 'Human'
}

export const stateIcon: Partial<Record<RunState, string>> = {
	coding: '01',
	planning: '02',
	reviewing: '03',
	running_commands: '04',
	preparing: '05',
	opening_pr: '06',
	waiting_human: '!!',
	queued: '--',
	completed: 'OK',
	failed: 'XX',
	cancelled: '~~'
}

export const stateTone: Record<RunState, PillTone> = {
	queued: 'neutral',
	preparing: 'cyan',
	planning: 'cyan',
	coding: 'live',
	running_commands: 'live',
	reviewing: 'violet',
	waiting_human: 'gold',
	opening_pr: 'mineral',
	completed: 'mineral',
	failed: 'oxide',
	cancelled: 'neutral'
}
