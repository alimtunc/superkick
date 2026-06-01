import { SECTION_LIMIT, isDone } from '@/components/command/commandSections'
import { buildEmptyRows } from '@/components/command/sections/buildEmptyRows'
import type { CommandBarMode, CommandBarState } from '@/hooks/useCommandBarReducer'
import type { Run, SearchResponse } from '@/types'

export function flattenRows(
	state: CommandBarState,
	mode: CommandBarMode,
	results: SearchResponse,
	needsYou: Run[],
	includeDone: boolean
): (string | null)[] {
	if (mode === 'empty') {
		return buildEmptyRows(needsYou).map((r) => r.target || null)
	}
	if (mode === 'typing') {
		const out: (string | null)[] = []
		for (const a of results.actions.slice(0, SECTION_LIMIT)) out.push(a.target ?? null)
		for (const i of results.issues.slice(0, SECTION_LIMIT)) out.push(`/issues/${i.id}`)
		for (const c of results.comments.slice(0, SECTION_LIMIT)) out.push(`/issues/${c.issueId}`)
		for (const _ of results.files.slice(0, SECTION_LIMIT)) out.push(null)
		for (const r of results.runs.slice(0, SECTION_LIMIT)) out.push(`/runs/${r.runId}`)
		return out
	}
	switch (state.scope) {
		case 'issues': {
			const open = results.issues.filter((i) => !isDone(i.stateType))
			const done = includeDone ? results.issues.filter((i) => isDone(i.stateType)) : []
			return [...open, ...done].map((i) => `/issues/${i.id}`)
		}
		case 'comments':
			return results.comments.map((c) => `/issues/${c.issueId}`)
		case 'files':
			return results.files.map(() => null)
		case 'runs':
			return results.runs.map((r) => `/runs/${r.runId}`)
		case 'actions':
			return results.actions.map((a) => a.target ?? null)
		default:
			return []
	}
}
