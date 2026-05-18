import type { AgentSummary } from '@/types'

const ACTIVE_SPARK = [3, 4, 3, 5, 4, 6, 5, 7, 6, 7, 8, 7]
const PAUSED_SPARK = [5, 5, 5, 5, 4, 4, 3, 3, 2, 2, 1, 1]

export const AGENTS_FIXTURE: AgentSummary[] = [
	{
		id: 'fix-bot',
		name: 'fix-bot',
		role: 'autofix',
		model: 'claude-sonnet-4.5',
		runs: 147,
		success: 92,
		sparkline: ACTIVE_SPARK,
		tags: ['repos: 4', 'PR-auto', 'budget $5'],
		tone: 'info',
		status: 'active'
	},
	{
		id: 'review-bot',
		name: 'review-bot',
		role: 'reviewer',
		model: 'claude-sonnet-4.5',
		runs: 241,
		success: 87,
		sparkline: ACTIVE_SPARK,
		tags: ['repos: all', 'read-only', 'fast'],
		tone: 'success',
		status: 'active'
	},
	{
		id: 'senior-bot',
		name: 'senior-bot',
		role: 'escalation',
		model: 'claude-opus-4.5',
		runs: 28,
		success: 75,
		sparkline: ACTIVE_SPARK,
		tags: ['after 2 retries', 'PR-auto', 'budget $25'],
		tone: 'warn',
		status: 'active'
	},
	{
		id: 'docs-bot',
		name: 'docs-bot',
		role: 'docs',
		model: 'claude-haiku-4.5',
		runs: 89,
		success: 98,
		sparkline: ACTIVE_SPARK,
		tags: ['docs/ only', 'PR-auto', 'budget $0.50'],
		tone: 'accent',
		status: 'active'
	},
	{
		id: 'dep-bot',
		name: 'dep-bot',
		role: 'dependencies',
		model: 'claude-haiku-4.5',
		runs: 64,
		success: 94,
		sparkline: ACTIVE_SPARK,
		tags: ['weekly cron', 'package.json + go.mod'],
		tone: 'neutral',
		status: 'active'
	},
	{
		id: 'triage-bot',
		name: 'triage-bot',
		role: 'triage',
		model: 'claude-haiku-4.5',
		runs: 312,
		success: 96,
		sparkline: ACTIVE_SPARK,
		tags: ['inbound issues', 'read-only', 'classify only'],
		tone: 'info',
		status: 'active'
	},
	{
		id: 'legacy-bot',
		name: 'legacy-bot',
		role: 'autofix',
		model: 'claude-haiku-4',
		runs: 12,
		success: 58,
		sparkline: PAUSED_SPARK,
		tags: ['paused 14d', 'budget $0'],
		tone: 'neutral',
		status: 'paused'
	},
	{
		id: 'nightly-bot',
		name: 'nightly-bot',
		role: 'cron',
		model: 'claude-haiku-4.5',
		runs: 4,
		success: 50,
		sparkline: PAUSED_SPARK,
		tags: ['paused', 'nightly cron'],
		tone: 'neutral',
		status: 'paused'
	}
]
