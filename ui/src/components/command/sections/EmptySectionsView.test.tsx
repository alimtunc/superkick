import { EmptySectionsView } from '@/components/command/sections/EmptySectionsView'
import type { Run } from '@/types'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const SAMPLE_RUN: Run = {
	id: 'run-abc',
	issue_id: 'issue-1',
	issue_identifier: 'SUP-201',
	repo_slug: 'org/repo',
	state: 'waiting_human',
	trigger_source: 'manual',
	current_step_key: null,
	base_branch: 'main',
	worktree_path: null,
	branch_name: null,
	operator_instructions: null,
	started_at: '2026-05-01T00:00:00Z',
	updated_at: '2026-05-01T00:00:00Z',
	finished_at: null,
	error_message: null,
	pause_kind: 'none',
	pause_reason: null,
	budget: {
		duration_secs: null,
		retries_max: null,
		token_ceiling: null
	}
}

describe('EmptySectionsView', () => {
	it('shows Needs you section when needsYou is non-empty', () => {
		render(
			<EmptySectionsView
				needsYou={[SAMPLE_RUN]}
				selectedIdx={0}
				onSelect={vi.fn()}
				onActivate={vi.fn()}
			/>
		)
		expect(screen.getByText('Needs you')).toBeInTheDocument()
		expect(screen.getByText('SUP-201')).toBeInTheDocument()
	})

	it('omits Needs you section when there are zero needs you', () => {
		render(<EmptySectionsView needsYou={[]} selectedIdx={0} onSelect={vi.fn()} onActivate={vi.fn()} />)
		expect(screen.queryByText('Needs you')).not.toBeInTheDocument()
		expect(screen.getByText('Quick actions')).toBeInTheDocument()
	})

	it('always renders Quick actions and Jump to sections (empty is never empty)', () => {
		render(<EmptySectionsView needsYou={[]} selectedIdx={0} onSelect={vi.fn()} onActivate={vi.fn()} />)
		expect(screen.getByText('Quick actions')).toBeInTheDocument()
		expect(screen.getByText('Jump to')).toBeInTheDocument()
		expect(screen.getByText('Launch task…')).toBeInTheDocument()
		expect(screen.getByText('Inbox')).toBeInTheDocument()
	})
})
