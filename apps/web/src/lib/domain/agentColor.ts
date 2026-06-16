const AGENT_COLOR: Record<string, string> = {
	'fix-bot': '#3a6f4e',
	'review-bot': '#5b6ef2',
	'senior-bot': '#a87a1f',
	'léa m': '#6f5ad9',
	'lea m': '#6f5ad9',
	'c. park': '#b06a3a',
	owen: '#357a8a'
}

const FALLBACK = 'var(--color-raised)'

export function agentColor(name?: string | null): string {
	if (!name) return FALLBACK
	return AGENT_COLOR[name.trim().toLowerCase()] ?? FALLBACK
}

export function isAgentName(name?: string | null): boolean {
	if (!name) return false
	return /\b(bot|agent)\b/.test(name.trim().toLowerCase())
}
