import type { IssueFilterState, IssueGroupBy, IssueSort, IssueViewLayout, IssueViewTab } from '@/types'
import { z } from 'zod'

/**
 * URL schema for the /issues route. Filter state is the URL — there is no
 * parallel React state — so this schema is the contract that drives
 * `useIssuesView`, the filter chips, and the saved-view tabs.
 */
const layoutLiteral = z.enum(['list', 'board']).optional()

export const issuesSearchSchema = z.object({
	tab: z.enum(['mine', 'all-open', 'shipped']).optional(),
	view: layoutLiteral,
	group: z.enum(['lifecycle', 'status', 'priority', 'project', 'assignee', 'none']).optional(),
	sort: z.enum(['updated', 'created', 'priority', 'age']).optional(),
	showDone: z.coerce.boolean().optional(),
	assignee: z.array(z.string()).optional(),
	status: z.array(z.string()).optional(),
	status_not: z.array(z.string()).optional(),
	priority: z.array(z.coerce.number().int().min(0).max(4)).optional(),
	label: z.array(z.string()).optional(),
	label_not: z.array(z.string()).optional(),
	project: z.array(z.string()).optional(),
	repo: z.array(z.string()).optional(),
	task: z.array(z.string()).optional(),
	created: z.array(z.string()).optional(),
	updated: z.array(z.string()).optional(),
	completed: z.array(z.string()).optional(),
	has_sub_issues: z.array(z.string()).optional()
})

export type IssuesSearch = z.infer<typeof issuesSearchSchema>

export interface ResolvedIssuesSearch {
	tab: IssueViewTab
	view: IssueViewLayout
	group: IssueGroupBy
	sort: IssueSort
	showDone: boolean
	filters: IssueFilterState
}

export const EMPTY_FILTERS: IssueFilterState = {
	assignee: [],
	status: [],
	status_not: [],
	priority: [],
	label: [],
	label_not: [],
	project: [],
	repo: [],
	task: [],
	created: [],
	updated: [],
	completed: [],
	has_sub_issues: []
}

/** Validate and coerce raw search params. Returns the partial URL shape —
 *  `resolveSearch` fills in defaults for the view-model. */
export function parseIssuesSearch(raw: unknown): IssuesSearch {
	return issuesSearchSchema.parse(raw)
}

/** Apply defaults to produce the resolved view-model input. The viewer-aware
 *  default tab degrades to `all-open` when Linear identity is unknown. */
export function resolveSearch(
	search: IssuesSearch,
	viewerId: string | null,
	showDonePref = false
): ResolvedIssuesSearch {
	return {
		tab: search.tab ?? (viewerId !== null ? 'mine' : 'all-open'),
		view: search.view ?? 'list',
		group: search.group ?? 'status',
		sort: search.sort ?? 'priority',
		showDone: search.showDone ?? showDonePref,
		filters: {
			assignee: search.assignee ?? [],
			status: search.status ?? [],
			status_not: search.status_not ?? [],
			priority: search.priority ?? [],
			label: search.label ?? [],
			label_not: search.label_not ?? [],
			project: search.project ?? [],
			repo: search.repo ?? [],
			task: search.task ?? [],
			created: search.created ?? [],
			updated: search.updated ?? [],
			completed: search.completed ?? [],
			has_sub_issues: search.has_sub_issues ?? []
		}
	}
}
