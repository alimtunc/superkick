import { IssueDescription } from '@/components/issue-detail/IssueDescription'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('IssueDescription', () => {
	it('renders Linear markdown as structured issue copy instead of raw text', () => {
		render(
			<IssueDescription
				description={[
					'## Context',
					'Task Cockpit still feels inconsistent with the approved mockups.',
					'',
					'• [SUP-169](https://linear.app/superkick/issue/SUP-169) — visual parity harness.',
					'• Rework `/tasks/:id` to match Task Cockpit artboards.'
				].join('\n')}
			/>
		)

		expect(screen.getByRole('heading', { name: 'Context', level: 2 })).toBeInTheDocument()
		expect(screen.queryByText('## Context')).not.toBeInTheDocument()
		expect(
			screen.getByText('Task Cockpit still feels inconsistent with the approved mockups.')
		).toBeInTheDocument()

		const list = screen.getByRole('list')
		expect(within(list).getAllByRole('listitem')).toHaveLength(2)
		expect(screen.getByRole('link', { name: 'SUP-169' })).toHaveAttribute(
			'href',
			'https://linear.app/superkick/issue/SUP-169'
		)
		expect(screen.getByText('/tasks/:id')).toBeInTheDocument()
	})
})
