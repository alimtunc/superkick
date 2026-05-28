import { formatHistoryEvent } from '@/components/issue-detail/historyFormat'
import { joinWithAnd } from '@/components/issue-detail/joinWithAnd'
import type { IssueAssignee, IssueHistoryEvent } from '@/types'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

function renderEvent(event: IssueHistoryEvent, actor: IssueAssignee | null = null) {
	return render(<span>{formatHistoryEvent(event, actor)}</span>)
}

const ALICE: IssueAssignee = { id: 'u-alice', name: 'Alice', avatar_url: null }
const BOB: IssueAssignee = { id: 'u-bob', name: 'Bob', avatar_url: null }

describe('formatHistoryEvent', () => {
	it('renders the synthetic Created event', () => {
		renderEvent({ kind: 'created' })
		expect(screen.getByText(/created the issue/i)).toBeInTheDocument()
	})

	it('renders DescriptionEdited as "updated the description"', () => {
		renderEvent({ kind: 'description_edited' })
		expect(screen.getByText(/updated the description/i)).toBeInTheDocument()
	})

	it('renders an initial status as "set status to <chip>"', () => {
		renderEvent({
			kind: 'status_changed',
			from: { id: 's0', name: 'Backlog', color: '#bec2c8', state_type: 'backlog' },
			to: { id: 's1', name: 'In Progress', color: '#f2c94c', state_type: 'started' }
		})
		expect(screen.getByText(/set status to/i)).toBeInTheDocument()
		expect(screen.getByText('In Progress')).toBeInTheDocument()
	})

	it('renders a non-initial status as "changed status from X to Y"', () => {
		renderEvent({
			kind: 'status_changed',
			from: { id: 's1', name: 'In Progress', color: '#f2c94c', state_type: 'started' },
			to: { id: 's2', name: 'Done', color: '#26b25e', state_type: 'completed' }
		})
		expect(screen.getByText(/changed status from/i)).toBeInTheDocument()
		expect(screen.getByText('In Progress')).toBeInTheDocument()
		expect(screen.getByText('Done')).toBeInTheDocument()
	})

	it('treats actor === toAssignee as "self-assigned the issue"', () => {
		renderEvent({ kind: 'assignee_changed', from: null, to: ALICE }, ALICE)
		expect(screen.getByText(/self-assigned the issue/i)).toBeInTheDocument()
	})

	it('renders unassign as "removed the assignee"', () => {
		renderEvent({ kind: 'assignee_changed', from: ALICE, to: null })
		expect(screen.getByText(/removed the assignee/i)).toBeInTheDocument()
	})

	it('renders fresh assignment as "assigned the issue to X"', () => {
		renderEvent({ kind: 'assignee_changed', from: null, to: BOB })
		expect(screen.getByText(/assigned the issue to Bob/i)).toBeInTheDocument()
	})

	it('renders reassignment as "changed assignee from X to Y"', () => {
		renderEvent({ kind: 'assignee_changed', from: ALICE, to: BOB })
		expect(screen.getByText(/changed assignee from Alice to Bob/i)).toBeInTheDocument()
	})

	it('says "raised priority" when moving toward Urgent (lower number)', () => {
		renderEvent({ kind: 'priority_changed', from: 3, to: 1 })
		expect(screen.getByText(/raised priority from Medium to Urgent/i)).toBeInTheDocument()
	})

	it('says "lowered priority" when moving toward Low (higher number)', () => {
		renderEvent({ kind: 'priority_changed', from: 1, to: 4 })
		expect(screen.getByText(/lowered priority from Urgent to Low/i)).toBeInTheDocument()
	})

	it('renders "set priority" when from is None', () => {
		renderEvent({ kind: 'priority_changed', from: 0, to: 2 })
		expect(screen.getByText(/set priority to High/i)).toBeInTheDocument()
	})

	it('renders "removed the priority" when to is None', () => {
		renderEvent({ kind: 'priority_changed', from: 2, to: 0 })
		expect(screen.getByText(/removed the priority/i)).toBeInTheDocument()
	})

	it('renders LabelsChanged with both sides joined by "and"', () => {
		renderEvent({
			kind: 'labels_changed',
			added: [{ name: 'bug', color: '#eb5757' }],
			removed: [{ name: 'old', color: '#aaa' }]
		})
		expect(screen.getByText(/added/i)).toBeInTheDocument()
		expect(screen.getByText('bug')).toBeInTheDocument()
		expect(screen.getByText(/removed/i)).toBeInTheDocument()
		expect(screen.getByText('old')).toBeInTheDocument()
	})

	it('renders project transitions', () => {
		renderEvent({
			kind: 'project_changed',
			from: null,
			to: { id: 'p1', name: 'Q2' }
		})
		expect(screen.getByText(/added to project Q2/i)).toBeInTheDocument()
	})

	it('renders cycle transitions with the cycle name', () => {
		renderEvent({
			kind: 'cycle_changed',
			from: null,
			to: { id: 'c1', name: 'Sprint 5', number: 5 }
		})
		expect(screen.getByText(/added to Sprint 5/i)).toBeInTheDocument()
	})

	it('renders cycle transitions with the number when name is null', () => {
		renderEvent({
			kind: 'cycle_changed',
			from: { id: 'c1', name: null, number: 5 },
			to: null
		})
		expect(screen.getByText(/removed from cycle 5/i)).toBeInTheDocument()
	})

	it('renders the initial estimate as "estimated complexity as N points"', () => {
		renderEvent({ kind: 'estimate_changed', from: null, to: 5 })
		expect(screen.getByText(/estimated complexity as 5 points/i)).toBeInTheDocument()
	})

	it('uses the singular "point" when estimate is 1', () => {
		renderEvent({ kind: 'estimate_changed', from: null, to: 1 })
		expect(screen.getByText(/estimated complexity as 1 point\b/i)).toBeInTheDocument()
	})

	it('uses "increased estimate" when the estimate grows', () => {
		renderEvent({ kind: 'estimate_changed', from: 5, to: 7 })
		expect(screen.getByText(/increased estimate from 5 points to 7 points/i)).toBeInTheDocument()
	})

	it('uses "decreased estimate" when the estimate shrinks', () => {
		renderEvent({ kind: 'estimate_changed', from: 7, to: 5 })
		expect(screen.getByText(/decreased estimate from 7 points to 5 points/i)).toBeInTheDocument()
	})

	it('renders "removed the estimate" when cleared', () => {
		renderEvent({ kind: 'estimate_changed', from: 3, to: null })
		expect(screen.getByText(/removed the estimate/i)).toBeInTheDocument()
	})

	it('renders the initial due date with the long format', () => {
		renderEvent({ kind: 'due_date_changed', from: null, to: '2026-06-15' })
		expect(screen.getByText(/set the due date to Jun 15, 2026/i)).toBeInTheDocument()
	})

	it('renders a due-date change with both long-formatted dates', () => {
		renderEvent({ kind: 'due_date_changed', from: '2026-06-15', to: '2026-07-01' })
		expect(screen.getByText(/changed the due date from Jun 15, 2026 to Jul 1, 2026/i)).toBeInTheDocument()
	})

	it('renders "removed the due date" when cleared', () => {
		renderEvent({ kind: 'due_date_changed', from: '2026-06-15', to: null })
		expect(screen.getByText(/removed the due date/i)).toBeInTheDocument()
	})

	it('renders title changes as "changed title to <new title>"', () => {
		renderEvent({ kind: 'title_changed', from: 'Old', to: 'New title' })
		expect(screen.getByText(/changed title to New title/i)).toBeInTheDocument()
		expect(screen.queryByText(/Old/)).toBeNull()
	})
})

describe('joinWithAnd', () => {
	it('returns null on empty input', () => {
		const { container } = render(<span>{joinWithAnd([])}</span>)
		expect(container.firstChild?.textContent).toBe('')
	})

	it('returns the single element as-is', () => {
		const { container } = render(<span>{joinWithAnd(['only'])}</span>)
		expect(container.textContent).toBe('only')
	})

	it('uses " and " for two elements', () => {
		const { container } = render(<span>{joinWithAnd(['a', 'b'])}</span>)
		expect(container.textContent).toBe('a and b')
	})

	it('uses Oxford comma for three or more', () => {
		const { container } = render(<span>{joinWithAnd(['a', 'b', 'c'])}</span>)
		expect(container.textContent).toBe('a, b, and c')
	})
})
