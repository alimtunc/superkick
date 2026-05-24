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

vi.mock('@/components/issues/HoverCard', () => ({
	HoverCard: ({ children }: { children: ReactNode }) => <>{children}</>
}))

function child(identifier: string, stateType: IssueChildRef['status']['state_type']): IssueChildRef {
	return {
		id: `issue-${identifier.toLowerCase()}`,
		identifier,
		title: identifier,
		status: { state_type: stateType, name: stateType, color: '#fff' },
		priority: { value: 2, label: 'High' },
		labels: [],
		assignee: null,
		updated_at: '2026-05-24T14:00:00.000Z'
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
})
