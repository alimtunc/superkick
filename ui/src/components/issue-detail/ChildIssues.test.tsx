import type { ReactNode } from 'react'

import { ChildIssues } from '@/components/issue-detail/ChildIssues'
import type { IssueChildRef } from '@/types'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
	Link: ({ children, ...rest }: { children: ReactNode } & Record<string, unknown>) => {
		const { to: _to, params: _params, ...attrs } = rest
		void _to
		void _params
		return (
			<a href="#" {...(attrs as Record<string, string>)}>
				{children}
			</a>
		)
	}
}))

function child(
	identifier: string,
	stateType: IssueChildRef['status']['state_type'],
	overrides: Partial<IssueChildRef> = {}
): IssueChildRef {
	return {
		id: `issue-${identifier.toLowerCase()}`,
		identifier,
		title: `Title for ${identifier}`,
		status: { state_type: stateType, name: stateType, color: '#fff' },
		priority: { value: 2, label: 'High' },
		labels: [],
		assignee: null,
		updated_at: '2026-05-24T14:00:00.000Z',
		...overrides
	}
}

describe('ChildIssues', () => {
	it('renders a Linear-like sub-issues card header with completion progress', () => {
		render(
			<ChildIssues
				issues={[
					child('ISS-1', 'completed'),
					child('ISS-2', 'completed'),
					child('ISS-3', 'completed'),
					child('ISS-4', 'started'),
					child('ISS-5', 'unstarted')
				]}
			/>
		)

		expect(screen.getByRole('heading', { name: 'Sub-issues' })).toBeInTheDocument()
		expect(screen.getByText('3 / 5')).toBeInTheDocument()
		expect(screen.getByLabelText('Sub-issues 60% complete')).toBeInTheDocument()
	})

	it('paints the card on surface (not void) with the 8px radius', () => {
		const { container } = render(<ChildIssues issues={[child('ISS-1', 'started')]} />)

		const card = container.firstElementChild
		expect(card).not.toBeNull()
		expect(card).toHaveClass('bg-surface')
		expect(card).toHaveClass('rounded-[8px]')
		expect(card).not.toHaveClass('bg-canvas')
	})

	it('renders each child as a compact sub-issue row (not a full list IssueRow)', () => {
		const { container } = render(
			<ChildIssues
				issues={[
					child('ISS-1', 'started', {
						assignee: { id: 'u1', name: 'Léa M', avatar_url: null }
					}),
					child('ISS-2', 'completed')
				]}
			/>
		)

		const rows = container.querySelectorAll('[data-sub-issue-row]')
		expect(rows).toHaveLength(2)
		expect(container.querySelectorAll('[data-issue-row]')).toHaveLength(0)

		expect(screen.getByText('ISS-1')).toBeInTheDocument()
		expect(screen.getByText('ISS-2')).toBeInTheDocument()
		expect(screen.getByText('Title for ISS-1')).toBeInTheDocument()
		expect(screen.getByLabelText('Assigned to Léa M')).toBeInTheDocument()
	})
})
