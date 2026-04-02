import { useMemo } from 'react'

import type { BucketFilter } from '@/components/issues/IssueFilters'
import { type ClassifiedIssues, classifyIssues } from '@/lib/domain/classifyIssues'
import { filterIssuesWithNesting } from '@/lib/domain/filterIssues'
import { type GroupedIssues, groupIssuesByParent } from '@/lib/domain/groupIssues'
import type { LinearIssueListItem } from '@/types'

interface IssueFilters {
	activeBucket: BucketFilter
	search: string
	activeLabels: Set<string>
	activeProject: string | null
	activePriorities: Set<number>
}

interface UseFilteredIssuesInput {
	allIssues: LinearIssueListItem[]
	filters: IssueFilters
}

export function useFilteredIssues({ allIssues, filters }: UseFilteredIssuesInput) {
	const { activeBucket, search, activeLabels, activeProject, activePriorities } = filters

	const classified: ClassifiedIssues = useMemo(() => classifyIssues(allIssues), [allIssues])

	const filteredIssues: LinearIssueListItem[] = useMemo(() => {
		const bucketIssues = activeBucket === 'all' ? allIssues : classified[activeBucket]
		return filterIssuesWithNesting(bucketIssues, {
			search,
			activeLabels,
			activeProject,
			activePriorities
		})
	}, [classified, allIssues, activeBucket, search, activeLabels, activeProject, activePriorities])

	const grouped: GroupedIssues = useMemo(() => groupIssuesByParent(filteredIssues), [filteredIssues])

	return { classified, filteredIssues, grouped }
}
