import type { SettingsRule } from '@/types'

export const RULES_FIXTURE: SettingsRule[] = [
	{
		id: 'destructive-sql',
		label: 'Pause on destructive SQL',
		hint: 'Agent halts before running DROP, TRUNCATE, or DELETE without a WHERE clause.',
		status: 'on',
		meta: 'applies to: 4 repos'
	},
	{
		id: 'coverage-drop',
		label: 'Coverage drop > 1%',
		hint: 'If tests pass but coverage drops more than 1%, the run is sent to your Inbox before opening a PR.',
		status: 'on',
		meta: 'applies to: all repos'
	},
	{
		id: 'security-tag',
		label: 'Touching //security tagged code',
		hint: 'Pause before modifying any line within a function tagged with `// security` or a file under `auth/`, `crypto/`.',
		status: 'on',
		meta: 'applies to: all repos'
	},
	{
		id: 'loop-detection',
		label: 'Loop detection — same failure 3×',
		hint: 'If the same test or check fails on 3 consecutive retries, escalate to senior-bot or send to Inbox.',
		status: 'on',
		meta: 'action: escalate to senior-bot'
	},
	{
		id: 'budget-exceeded',
		label: 'Budget exceeded',
		hint: 'Pause when a run consumes more than its set budget.',
		status: 'off'
	}
]
