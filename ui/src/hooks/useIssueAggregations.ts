import { useMemo } from 'react'

import type { LinearIssueListItem } from '@/types'

export function useIssueAggregations(allIssues: LinearIssueListItem[]) {
	const { allLabels, labelCounts } = useMemo(() => {
		const counts = new Map<string, number>()
		for (const issue of allIssues) {
			for (const label of issue.labels) {
				counts.set(label.name, (counts.get(label.name) ?? 0) + 1)
			}
		}
		return { allLabels: [...counts.keys()].toSorted(), labelCounts: counts }
	}, [allIssues])

	const allProjects: string[] = useMemo(() => {
		const set = new Set<string>()
		for (const issue of allIssues) {
			if (issue.project) {
				set.add(issue.project.name)
			}
		}
		return [...set].toSorted()
	}, [allIssues])

	return { allLabels, labelCounts, allProjects }
}
