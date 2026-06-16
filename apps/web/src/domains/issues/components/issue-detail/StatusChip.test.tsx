import { StatusChip } from '@/domains/issues/components/issue-detail/StatusChip'
import type { IssueStatus } from '@/types'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('StatusChip', () => {
	it('renders the status name and a StatusIcon together', () => {
		const status: IssueStatus = {
			state_type: 'started',
			name: 'In Progress',
			color: '#f2c94c'
		}
		render(<StatusChip status={status} />)

		expect(screen.getByText('In Progress')).toBeInTheDocument()
		expect(screen.getByRole('img', { name: /in progress/i })).toBeInTheDocument()
	})

	it('routes review-named started states to the review glyph', () => {
		const status: IssueStatus = {
			state_type: 'started',
			name: 'In Review',
			color: '#7c3aed'
		}
		render(<StatusChip status={status} />)
		expect(screen.getByRole('img', { name: /in review/i })).toBeInTheDocument()
	})
})
