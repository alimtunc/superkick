import type { FailureClassification, LaunchTaskStep } from '@/types'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { LaunchStepFailureRow } from '../LaunchStepFailureRow'

function step(overrides: Partial<LaunchTaskStep> = {}): LaunchTaskStep {
	return {
		id: 'step-1',
		launch_task_id: 'task-1',
		sequence: 2,
		step_kind: 'implement',
		agent_name: 'coder-default',
		provider: 'claude',
		model: 'claude-opus-4-7',
		mode: null,
		status: 'needs_human',
		linked_run_id: null,
		linked_conversation_id: null,
		linked_orchestrator_session_id: null,
		summary: null,
		structured_result: null,
		failure_classification: null,
		created_at: '2026-05-19T00:00:00Z',
		updated_at: '2026-05-19T00:00:00Z',
		...overrides
	}
}

interface Case {
	name: string
	classification: FailureClassification
	stepStatus?: LaunchTaskStep['status']
	expects: {
		headlineSubstring: string
		hintSubstring?: string
		detailSubstring?: string
		negativeSubstring?: string
	}
}

const CASES: Case[] = [
	{
		name: 'missing_marker',
		classification: { kind: 'missing_marker' },
		expects: { headlineSubstring: "didn't report completion" }
	},
	{
		name: 'malformed_marker',
		classification: { kind: 'malformed_marker', detail: 'unexpected token `}`' },
		expects: { headlineSubstring: 'malformed', detailSubstring: 'unexpected token `}`' }
	},
	{
		name: 'agent_reported needs_human',
		classification: { kind: 'agent_reported', status: 'needs_human', summary: 'awaiting choice' },
		expects: { headlineSubstring: 'asked for help', hintSubstring: 'awaiting choice' }
	},
	{
		name: 'agent_reported failed',
		classification: { kind: 'agent_reported', status: 'failed', summary: 'core dumped' },
		stepStatus: 'failed',
		expects: { headlineSubstring: 'Agent reported failure', detailSubstring: 'core dumped' }
	},
	{
		name: 'auth_required claude',
		classification: { kind: 'auth_required', provider: 'claude' },
		expects: { headlineSubstring: 'Sign in to Claude' }
	},
	{
		name: 'auth_required codex',
		classification: { kind: 'auth_required', provider: 'codex' },
		expects: { headlineSubstring: 'Sign in to Codex' }
	},
	{
		name: 'quota_exceeded with reset_at',
		classification: { kind: 'quota_exceeded', provider: 'claude', reset_at: '3:42pm' },
		expects: { headlineSubstring: 'Claude quota', hintSubstring: '3:42pm' }
	},
	{
		name: 'quota_exceeded without reset_at',
		classification: { kind: 'quota_exceeded', provider: 'codex', reset_at: null },
		expects: { headlineSubstring: 'Codex quota', negativeSubstring: 'undefined' }
	},
	{
		name: 'cli_missing',
		classification: {
			kind: 'cli_missing',
			binary: 'claude',
			install_hint: 'brew install anthropics/cli/claude'
		},
		stepStatus: 'failed',
		expects: { headlineSubstring: 'claude CLI', detailSubstring: 'brew install' }
	},
	{
		name: 'timeout (30m)',
		classification: { kind: 'timeout', after: 1_800_000 },
		expects: { headlineSubstring: 'wall-clock budget', hintSubstring: '30m' }
	},
	{
		name: 'no_diff',
		classification: { kind: 'no_diff' },
		expects: { headlineSubstring: 'no diff' }
	},
	{
		name: 'tests_failed',
		classification: { kind: 'tests_failed', summary: '3 failures in fooctl::tests' },
		expects: { headlineSubstring: 'Tests reported', detailSubstring: 'fooctl::tests' }
	},
	{
		name: 'spawn_error',
		classification: { kind: 'spawn_error', detail: 'permission denied' },
		stepStatus: 'failed',
		expects: { headlineSubstring: 'spawn', detailSubstring: 'permission denied' }
	},
	{
		name: 'agent_non_zero_exit',
		classification: { kind: 'agent_non_zero_exit', exit_code: 137, role: 'implementer' },
		expects: { headlineSubstring: 'implementer', hintSubstring: 'terminal' }
	}
]

describe('LaunchStepFailureRow', () => {
	for (const c of CASES) {
		it(`renders the ${c.name} variant with class-aware copy`, () => {
			const { container } = render(
				<LaunchStepFailureRow
					step={step({ status: c.stepStatus ?? 'needs_human' })}
					classification={c.classification}
				/>
			)
			const body = container.textContent ?? ''
			expect(body).toMatch(new RegExp(c.expects.headlineSubstring, 'i'))
			if (c.expects.hintSubstring) {
				expect(body).toMatch(new RegExp(c.expects.hintSubstring, 'i'))
			}
			if (c.expects.detailSubstring) {
				expect(body).toMatch(new RegExp(c.expects.detailSubstring, 'i'))
			}
			if (c.expects.negativeSubstring) {
				expect(body).not.toMatch(new RegExp(c.expects.negativeSubstring, 'i'))
			}
		})
	}

	it('renders the provider chip for auth_required', () => {
		render(
			<LaunchStepFailureRow
				step={step()}
				classification={{ kind: 'auth_required', provider: 'codex' }}
			/>
		)
		// Standalone Pill renders the provider label exactly.
		expect(screen.getByText('Codex')).toBeInTheDocument()
	})

	it('renders the binary as a danger pill for cli_missing', () => {
		render(
			<LaunchStepFailureRow
				step={step({ status: 'failed' })}
				classification={{
					kind: 'cli_missing',
					binary: 'codex',
					install_hint: 'npm install -g @openai/codex'
				}}
			/>
		)
		expect(screen.getByText('codex')).toBeInTheDocument()
	})
})
