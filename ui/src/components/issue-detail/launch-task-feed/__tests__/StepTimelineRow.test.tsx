import type { ReactNode } from 'react'

import type { LaunchTask, LaunchTaskStep, StepResult } from '@/types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { StepTimelineRow } from '../StepTimelineRow'

function step(overrides: Partial<LaunchTaskStep> = {}): LaunchTaskStep {
	return {
		id: overrides.id ?? 'step-1',
		launch_task_id: 'task-1',
		sequence: overrides.sequence ?? 1,
		step_kind: overrides.step_kind ?? 'implement',
		agent_name: overrides.agent_name ?? 'coder-default',
		provider: overrides.provider ?? 'claude',
		model: overrides.model ?? 'claude-opus-4-7',
		mode: null,
		status: overrides.status ?? 'completed',
		linked_run_id: overrides.linked_run_id ?? null,
		linked_conversation_id: overrides.linked_conversation_id ?? null,
		linked_orchestrator_session_id: overrides.linked_orchestrator_session_id ?? null,
		summary: overrides.summary ?? null,
		structured_result: overrides.structured_result ?? null,
		failure_classification: overrides.failure_classification ?? null,
		auto_resume_count: overrides.auto_resume_count ?? 0,
		created_at: '2026-05-19T00:00:00Z',
		updated_at: '2026-05-19T00:00:00Z'
	}
}

function task(overrides: Partial<LaunchTask> = {}): LaunchTask {
	return {
		id: 'task-1',
		linear_issue_id: 'TEAM-1',
		recipe_kind: 'plan_implement_review',
		status: overrides.status ?? 'running',
		current_step_id: overrides.current_step_id ?? null,
		summary: null,
		created_at: '2026-05-19T00:00:00Z',
		updated_at: '2026-05-19T00:00:00Z'
	}
}

function result(overrides: Partial<StepResult> = {}): StepResult {
	return {
		status: overrides.status ?? 'completed',
		summary: overrides.summary ?? 'structured summary text',
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

describe('StepTimelineRow', () => {
	it('renders kind, agent, and status label in the header', () => {
		render(
			wrap(
				<StepTimelineRow
					step={step({ step_kind: 'plan', agent_name: 'planner', status: 'running' })}
					task={task()}
				/>
			)
		)
		expect(screen.getByText(/Plan · planner/)).toBeInTheDocument()
		expect(screen.getByText(/running/i)).toBeInTheDocument()
	})

	it('pulses the active step that matches the task current_step_id', () => {
		const { container } = render(
			wrap(
				<StepTimelineRow
					step={step({ id: 'plan-step', status: 'running' })}
					task={task({ current_step_id: 'plan-step', status: 'running' })}
				/>
			)
		)
		// Active running steps render a pulsing status dot.
		expect(container.querySelector('span.sk-pulse')).not.toBeNull()
	})

	it('renders the structured summary card when structured_result is present', () => {
		render(
			wrap(
				<StepTimelineRow
					step={step({
						status: 'completed',
						structured_result: result({
							summary: 'structured result summary',
							changed_files: ['crates/superkick-core/src/launch_task.rs']
						})
					})}
					task={task()}
				/>
			)
		)
		expect(screen.getByText(/structured result summary/i)).toBeInTheDocument()
		expect(screen.getByText('crates/superkick-core/src/launch_task.rs')).toBeInTheDocument()
	})

	it('renders the failure body when a classification is present', () => {
		render(
			wrap(
				<StepTimelineRow
					step={step({
						status: 'needs_human',
						failure_classification: { kind: 'auth_required', provider: 'claude' }
					})}
					task={task()}
				/>
			)
		)
		expect(screen.getByText(/Sign in to Claude required/i)).toBeInTheDocument()
	})

	it('composes failure body and structured summary when both are present', () => {
		render(
			wrap(
				<StepTimelineRow
					step={step({
						status: 'needs_human',
						failure_classification: {
							kind: 'agent_reported',
							status: 'needs_human',
							summary: 'awaiting choice'
						},
						structured_result: result({
							status: 'needs_human',
							summary: 'partial structured summary',
							questions: ['Which option do you want?']
						})
					})}
					task={task()}
				/>
			)
		)
		expect(screen.getByText(/asked for help/i)).toBeInTheDocument()
		expect(screen.getByText(/partial structured summary/i)).toBeInTheDocument()
		expect(screen.getByText(/Which option do you want\?/i)).toBeInTheDocument()
	})

	it('falls back to the free-form summary when neither classification nor structured_result is present', () => {
		render(
			wrap(
				<StepTimelineRow
					step={step({ status: 'completed', summary: 'free-form summary' })}
					task={task()}
				/>
			)
		)
		expect(screen.getByText(/free-form summary/i)).toBeInTheDocument()
	})

	it('exposes evidence link surrogates when the step carries them', () => {
		render(
			wrap(
				<StepTimelineRow
					step={step({
						status: 'completed',
						linked_conversation_id: 'conv-1',
						linked_orchestrator_session_id: 'orch-1',
						structured_result: result({ summary: 'structured' })
					})}
					task={task()}
				/>
			)
		)
		expect(screen.getByText('Conversation')).toBeInTheDocument()
		expect(screen.getByText('Orchestrator')).toBeInTheDocument()
	})
})
