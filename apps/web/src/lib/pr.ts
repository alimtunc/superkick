import type { LinkedPrSummary, LinkedRunSummary } from '@/types'

/** The most recent linked run's PR, or null when no linked run has one. Used to
 *  surface a single "current" PR on issue-level surfaces (rail, list rows). */
export function pickLatestPr(linkedRuns: readonly LinkedRunSummary[]): LinkedPrSummary | null {
	const withPr = linkedRuns.filter((run) => run.pr)
	if (withPr.length === 0) return null
	const latest = withPr.toSorted((a, b) => b.started_at.localeCompare(a.started_at))[0]
	return latest.pr ?? null
}
