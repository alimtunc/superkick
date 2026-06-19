import type { LinearStatusChoice, WorkflowStateOption } from '@/types'

interface ComposeShipBodyInput {
	includeSummary: boolean
	includeChangedFiles: boolean
	summary: string
	changedFiles: readonly string[]
}

/** Build the PR body from the operator's include toggles. Never fabricates: a
 *  section is emitted only when its toggle is on and the source data is present. */
export function composeShipBody({
	includeSummary,
	includeChangedFiles,
	summary,
	changedFiles
}: ComposeShipBodyInput): string {
	const parts: string[] = []
	const trimmedSummary = summary.trim()
	if (includeSummary && trimmedSummary) parts.push(trimmedSummary)
	if (includeChangedFiles && changedFiles.length > 0) {
		parts.push(['### Changed files', ...changedFiles.map((file) => `- \`${file}\``)].join('\n'))
	}
	return parts.join('\n\n')
}

/**
 * Resolve the concrete Linear workflow-state id for an operator status choice.
 * `in_review` = the team's `started`-typed lane named ~"review" (the type-based
 * resolver can't distinguish it from In Progress); `done` = the lowest-position
 * `completed` lane. Returns null when no matching lane exists so the modal can
 * disable that choice instead of silently mis-targeting In Progress.
 */
export function resolveLinearStatusStateId(
	states: readonly WorkflowStateOption[],
	choice: LinearStatusChoice
): string | null {
	if (choice === 'no_change') return null
	const sorted = states.toSorted((a, b) => a.position - b.position)
	if (choice === 'done') {
		return sorted.find((state) => state.state_type === 'completed')?.id ?? null
	}
	return (
		sorted.find((state) => state.state_type === 'started' && state.name.toLowerCase().includes('review'))
			?.id ?? null
	)
}
