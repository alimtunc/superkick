import { RunMetaStrip } from '@/domains/runs/components/run-shared/RunMetaStrip'
import type { AgentSession, Run } from '@/types'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

function buildRun(overrides: Partial<Run> = {}): Run {
	return {
		id: 'run-abc-123',
		issue_id: 'issue-1',
		issue_identifier: 'SUP-178',
		repo_slug: 'org/repo',
		state: 'coding',
		trigger_source: 'launch',
		current_step_key: 'code',
		base_branch: 'main',
		worktree_path: '/tmp/.worktrees/sup-178',
		branch_name: 'alimtunc/sup-178',
		operator_instructions: null,
		started_at: '2026-05-25T10:00:00.000Z',
		updated_at: '2026-05-25T10:01:00.000Z',
		finished_at: null,
		error_message: null,
		budget: { duration_secs: null, retries_max: null, token_ceiling: null },
		pause_kind: 'none',
		pause_reason: null,
		...overrides
	}
}

function buildSession(overrides: Partial<AgentSession> = {}): AgentSession {
	return {
		id: 'sess-1',
		run_id: 'run-abc-123',
		run_step_id: 'step-1',
		provider: 'claude',
		command: 'claude',
		pid: null,
		status: 'running',
		started_at: '2026-05-25T10:00:30.000Z',
		finished_at: null,
		exit_code: null,
		linear_context_mode: null,
		role: null,
		purpose: null,
		parent_session_id: null,
		launch_reason: null,
		handoff_id: null,
		...overrides
	}
}

describe('RunMetaStrip', () => {
	it('renders all five canonical columns', () => {
		render(<RunMetaStrip run={buildRun()} sessions={[buildSession()]} />)

		expect(screen.getByText('Agent')).toBeInTheDocument()
		expect(screen.getByText('Model')).toBeInTheDocument()
		expect(screen.getByText('Branch')).toBeInTheDocument()
		expect(screen.getByText('Worktree')).toBeInTheDocument()
		expect(screen.getByText('Started')).toBeInTheDocument()
	})

	it('falls back to "not attached" for Model when no session model is exposed', () => {
		render(<RunMetaStrip run={buildRun()} sessions={[buildSession()]} />)
		const all = screen.getAllByText('not attached')
		expect(all.length).toBeGreaterThan(0)
	})

	it('renders the branch value when present', () => {
		render(<RunMetaStrip run={buildRun()} sessions={[buildSession()]} />)
		expect(screen.getByText('alimtunc/sup-178')).toBeInTheDocument()
	})

	it('shows "not set" for branch when missing', () => {
		render(<RunMetaStrip run={buildRun({ branch_name: null })} sessions={[buildSession()]} />)
		expect(screen.getByText('not set')).toBeInTheDocument()
	})

	it('renders the comfortable layout by default and the compact layout when asked', () => {
		const { rerender } = render(<RunMetaStrip run={buildRun()} sessions={[buildSession()]} />)
		// Comfortable surfaces Model + Worktree columns; compact swaps them for Mode.
		expect(screen.getByText('Model')).toBeInTheDocument()
		expect(screen.getByText('Worktree')).toBeInTheDocument()
		expect(screen.queryByText('Mode')).not.toBeInTheDocument()

		rerender(<RunMetaStrip run={buildRun()} sessions={[buildSession()]} density="compact" />)
		expect(screen.getByText('Mode')).toBeInTheDocument()
		expect(screen.queryByText('Model')).not.toBeInTheDocument()
		expect(screen.queryByText('Worktree')).not.toBeInTheDocument()
	})
})
