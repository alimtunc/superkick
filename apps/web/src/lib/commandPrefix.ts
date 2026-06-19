import type { SearchScope } from '@/types'

const PREFIX_MAP: Record<string, SearchScope> = {
	'i:': 'issues',
	'c:': 'comments',
	'f:': 'files',
	'r:': 'runs'
}

export interface ParsedPrefix {
	scope: SearchScope | null
	rest: string
}

export function parseCommandPrefix(raw: string): ParsedPrefix {
	if (raw.length < 2) return { scope: null, rest: raw }
	const head = raw.slice(0, 2).toLowerCase()
	const scope = PREFIX_MAP[head]
	if (!scope) return { scope: null, rest: raw }
	return { scope, rest: raw.slice(2).trimStart() }
}
