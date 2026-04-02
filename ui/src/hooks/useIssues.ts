import { useFilteredIssues } from './useFilteredIssues'
import { useIssueAggregations } from './useIssueAggregations'
import { useIssueFilters } from './useIssueFilters'
import { useIssuesQuery } from './useIssuesQuery'

export function useIssues(limit = 200) {
	const query = useIssuesQuery(limit)
	const filters = useIssueFilters()
	const aggregations = useIssueAggregations(query.allIssues)
	const derived = useFilteredIssues({ allIssues: query.allIssues, filters })

	return {
		...query,
		...filters,
		...aggregations,
		...derived
	}
}

export type IssuesData = ReturnType<typeof useIssues>
