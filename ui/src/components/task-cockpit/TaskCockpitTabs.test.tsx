import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { TaskCockpitTabs } from './TaskCockpitTabs'

describe('TaskCockpitTabs', () => {
	it('renders accessible tabs and changes selection on click', () => {
		const onChangeTab = vi.fn()
		render(<TaskCockpitTabs steps={[]} activeTab="activity" onChangeTab={onChangeTab} />)

		expect(screen.getByRole('tablist', { name: 'Task cockpit' })).toBeInTheDocument()
		expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true')

		screen.getByRole('tab', { name: 'Files changed' }).click()

		expect(onChangeTab).toHaveBeenCalledWith('files')
	})

	it('labels the summaries tab "Step summaries", not "Raw logs"', () => {
		render(<TaskCockpitTabs steps={[]} activeTab="activity" onChangeTab={() => {}} />)

		expect(screen.getByRole('tab', { name: 'Step summaries' })).toBeInTheDocument()
		expect(screen.queryByRole('tab', { name: /raw logs/i })).not.toBeInTheDocument()
	})

	it('does not surface a Tool calls tab on Task Cockpit', () => {
		render(<TaskCockpitTabs steps={[]} activeTab="activity" onChangeTab={() => {}} />)

		expect(screen.queryByRole('tab', { name: /tool calls/i })).not.toBeInTheDocument()
	})
})
