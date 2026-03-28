import type { Run, RunState } from '@/types'

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

export const stateBgColor: Record<RunState, string> = {
	queued: 'bg-dim',
	preparing: 'bg-cyan',
	planning: 'bg-cyan',
	coding: 'bg-neon-green',
	running_commands: 'bg-neon-green',
	reviewing: 'bg-violet',
	waiting_human: 'bg-gold',
	opening_pr: 'bg-mineral',
	completed: 'bg-mineral',
	failed: 'bg-oxide',
	cancelled: 'bg-dim'
}

export const stateTextColor: Record<RunState, string> = {
	queued: 'text-dim',
	preparing: 'text-cyan',
	planning: 'text-cyan',
	coding: 'text-neon-green',
	running_commands: 'text-neon-green',
	reviewing: 'text-violet',
	waiting_human: 'text-gold',
	opening_pr: 'text-mineral',
	completed: 'text-mineral',
	failed: 'text-oxide',
	cancelled: 'text-dim'
}

export const stateBadgeStyle: Record<RunState, string> = {
	queued: 'text-dim bg-dim/10',
	preparing: 'text-cyan bg-cyan-dim',
	planning: 'text-cyan bg-cyan-dim',
	coding: 'text-neon-green bg-mineral-dim',
	running_commands: 'text-neon-green bg-mineral-dim',
	reviewing: 'text-violet bg-violet-dim',
	waiting_human: 'text-gold bg-gold-dim',
	opening_pr: 'text-mineral bg-mineral-dim',
	completed: 'text-mineral bg-mineral-dim',
	failed: 'text-oxide bg-oxide-dim',
	cancelled: 'text-dim bg-dim/10'
}

export interface DistItem {
	label: string
	count: number
	color: string
}

export function stateDistribution(runs: Run[]): DistItem[] {
	const counts = new Map<string, number>()
	for (const run of runs) counts.set(run.state, (counts.get(run.state) ?? 0) + 1)

	return Array.from(counts.entries())
		.sort((a, b) => b[1] - a[1])
		.map(([label, count]) => ({
			label: label.replace(/_/g, ' '),
			count,
			color: stateBgColor[label as RunState] ?? 'bg-dim'
		}))
}
