import type { ReactNode } from 'react'

import { RunStatusBanner } from '@/components/run-detail/RunStatusBanner'
import type { Run } from '@/types'
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

function buildRun(overrides: Partial<Run> = {}): Run {
	return {
		id: 'run-abc-123',
		issue_id: 'issue-1',
		issue_identifier: 'SUP-178',
		repo_slug: 'org/repo',
		state: 'waiting_human',
		trigger_source: 'launch',
		current_step_key: null,
		base_branch: 'main',
		worktree_path: null,
		branch_name: null,
		operator_instructions: null,
		started_at: '2026-05-25T10:00:00.000Z',
		updated_at: '2026-05-25T10:01:00.000Z',
		finished_at: null,
		error_message: null,
		budget: { duration_secs: null, retries_max: null, token_ceiling: null },
		pause_kind: 'approval',
		pause_reason: 'Please confirm approach',
		...overrides
	}
}

describe('RunStatusBanner — NeedsHumanBanner', () => {
	it('renders the Open Task link and the reason, with no decision form controls', () => {
		render(<RunStatusBanner run={buildRun()} pr={null} isTerminal={false} needsHuman={true} />)

		const link = screen.getByRole('link', { name: 'Open issue SUP-178' })
		expect(link).toHaveTextContent(/Open Task/)

		expect(screen.getByText('Approval required')).toBeInTheDocument()
		expect(screen.getByText('Please confirm approach')).toBeInTheDocument()

		expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
		expect(document.querySelector('form')).toBeNull()
		expect(document.querySelector('textarea')).toBeNull()
		expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument()
		expect(screen.queryByRole('button', { name: /reject/i })).not.toBeInTheDocument()
	})
})
