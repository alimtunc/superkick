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

export const runStateLabel: Record<RunState, string> = {
	queued: 'Queued',
	preparing: 'Preparing',
	planning: 'Planning',
	coding: 'Coding',
	running_commands: 'Running commands',
	reviewing: 'Reviewing',
	waiting_human: 'Waiting on you',
	opening_pr: 'Opening PR',
	completed: 'Completed',
	failed: 'Failed',
	cancelled: 'Cancelled'
}

export const stateTone: Record<RunState, PillTone> = {
	queued: 'neutral',
	preparing: 'info',
	planning: 'info',
	coding: 'success',
	running_commands: 'success',
	reviewing: 'accent',
	waiting_human: 'warn',
	opening_pr: 'success',
	completed: 'success',
	failed: 'danger',
	cancelled: 'neutral'
}
