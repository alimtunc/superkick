import type { ReactNode } from 'react'

import type { FailureClassification, LaunchTask, LaunchTaskStep, StepResult } from '@/types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { LaunchTaskCompletionSummary } from '../LaunchTaskCompletionSummary'

function step(overrides: Partial<LaunchTaskStep>): LaunchTaskStep {
	return {
		id: overrides.id ?? 'step-final',
		launch_task_id: 'task-1',
		sequence: overrides.sequence ?? 3,
		step_kind: overrides.step_kind ?? 'implement',
		agent_name: overrides.agent_name ?? 'coder',
		provider: 'claude',
		model: null,
		mode: null,
		status: overrides.status ?? 'completed',
		linked_run_id: overrides.linked_run_id ?? null,
		linked_conversation_id: null,
		linked_orchestrator_session_id: null,
		summary: overrides.summary ?? null,
		structured_result: overrides.structured_result ?? null,
		failure_classification: overrides.failure_classification ?? null,
		created_at: '2026-05-19T00:00:00Z',
		updated_at: '2026-05-19T00:00:00Z'
	}
}

function task(overrides: Partial<LaunchTask> = {}): LaunchTask {
	return {
		id: 'task-1',
		linear_issue_id: 'TEAM-1',
		recipe_kind: 'plan_implement_review',
		status: overrides.status ?? 'completed',
		current_step_id: overrides.current_step_id ?? null,
		summary: overrides.summary ?? null,
		created_at: '2026-05-19T00:00:00Z',
		updated_at: '2026-05-19T00:00:00Z'
	}
}

function structured(overrides: Partial<StepResult> = {}): StepResult {
	return {
		status: overrides.status ?? 'completed',
		summary: overrides.summary ?? 'shipped the completion summary card',
		changed_files: overrides.changed_files ?? [],
		questions: overrides.questions ?? []
	}
}

function wrap(node: ReactNode) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
	})
	return <QueryClientProvider client={client}>{node}</QueryClientProvider>
}

describe('LaunchTaskCompletionSummary', () => {
	it('renders the success card with summary, file pills, and the open-terminal CTA', () => {
		const finalStep = step({
			structured_result: structured({
				summary: 'wired the completion summary into the feed',
				changed_files: ['ui/src/a.tsx', 'ui/src/b.tsx', 'ui/src/c.tsx']
			})
		})
		render(
			wrap(
				<LaunchTaskCompletionSummary
					kind="success"
					task={task({ status: 'completed' })}
					finalStep={finalStep}
					classification={null}
					linkedRunId="run-1"
					worktreePath="/Users/me/code/repo/.worktrees/sup-155"
					branchName="alimtunc/sup-155"
				/>
			)
		)
		expect(screen.getByText(/Launch task complete/i)).toBeInTheDocument()
		expect(screen.getByText(/wired the completion summary into the feed/i)).toBeInTheDocument()
		expect(screen.getByText('ui/src/a.tsx')).toBeInTheDocument()
		expect(screen.getByText('ui/src/c.tsx')).toBeInTheDocument()
		expect(screen.getByText(/alimtunc\/sup-155/)).toBeInTheDocument()
		expect(screen.getByRole('button', { name: /Open terminal here/i })).toBeInTheDocument()
	})

	it('caps the visible changed-files list at six entries and shows the overflow counter', () => {
		const files = Array.from({ length: 10 }, (_, index) => `path/to/file_${index}.ts`)
		render(
			wrap(
				<LaunchTaskCompletionSummary
					kind="success"
					task={task()}
					finalStep={step({ structured_result: structured({ changed_files: files }) })}
					classification={null}
					linkedRunId={null}
					worktreePath={null}
					branchName={null}
				/>
			)
		)
		for (const visible of files.slice(0, 6)) {
			expect(screen.getByText(visible)).toBeInTheDocument()
		}
		expect(screen.queryByText(files[6])).not.toBeInTheDocument()
		expect(screen.getByText(/\+4 more/i)).toBeInTheDocument()
	})

	it('renders the failure card with the classification headline + hint and hides the open-terminal CTA when no worktree', () => {
		const classification: FailureClassification = {
			kind: 'cli_missing',
			binary: 'claude',
			install_hint: 'brew install claude'
		}
		render(
			wrap(
				<LaunchTaskCompletionSummary
					kind="failure"
					task={task({ status: 'failed', summary: 'raw error string that must not leak' })}
					finalStep={step({ status: 'failed', failure_classification: classification })}
					classification={classification}
					linkedRunId="run-1"
					worktreePath={null}
					branchName={null}
				/>
			)
		)
		expect(screen.getByText(/claude CLI not found on PATH/i)).toBeInTheDocument()
		expect(screen.getByText(/Install the CLI locally/i)).toBeInTheDocument()
		expect(screen.getByText(/brew install claude/i)).toBeInTheDocument()
		expect(screen.queryByText(/raw error string/i)).not.toBeInTheDocument()
		expect(screen.queryByRole('button', { name: /Open terminal here/i })).not.toBeInTheDocument()
	})

	it('falls back to a status-specific headline when no failure classification is present (cancelled task)', () => {
		render(
			wrap(
				<LaunchTaskCompletionSummary
					kind="failure"
					task={task({ status: 'cancelled' })}
					finalStep={null}
					classification={null}
					linkedRunId={null}
					worktreePath={null}
					branchName={null}
				/>
			)
		)
		expect(screen.getByText(/Launch task cancelled/i)).toBeInTheDocument()
	})

	it('shows a "no worktree" hint on success when the run never created one', () => {
		render(
			wrap(
				<LaunchTaskCompletionSummary
					kind="success"
					task={task()}
					finalStep={step({ structured_result: structured() })}
					classification={null}
					linkedRunId={null}
					worktreePath={null}
					branchName={null}
				/>
			)
		)
		expect(screen.getByText(/No worktree was created/i)).toBeInTheDocument()
	})
})
