import { SectionTitle } from '@/components/dashboard/SectionTitle'
import { LatestRunCard } from '@/components/issue-detail/LatestRunCard'
import { RunHistoryList } from '@/components/issue-detail/RunHistoryList'
import { useIssueRuns } from '@/hooks/useIssueRuns'
import type { LinkedRunSummary } from '@/types'

interface IssueRunsPanelProps {
	runs: LinkedRunSummary[]
}

export function IssueRunsPanel({ runs }: IssueRunsPanelProps) {
	const { total, latest, tail, overflow } = useIssueRuns(runs)

	if (!latest) return null

	return (
		<section className="mb-6">
			<SectionTitle title="RUNS" count={total} />
			<LatestRunCard run={latest} />
			{tail.length > 0 ? <RunHistoryList runs={tail} overflow={overflow} /> : null}
		</section>
	)
}
