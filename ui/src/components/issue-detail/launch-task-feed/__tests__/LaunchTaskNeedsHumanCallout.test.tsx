import type { ReactNode } from 'react'

import type { FailureClassification, LaunchTaskStep } from '@/types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { LaunchTaskNeedsHumanCallout } from '../LaunchTaskNeedsHumanCallout'

function blockingStep(overrides: Partial<LaunchTaskStep> = {}): LaunchTaskStep {
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

function withQueryClient(node: ReactNode) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
	})
	return <QueryClientProvider client={client}>{node}</QueryClientProvider>
}

describe('LaunchTaskNeedsHumanCallout', () => {
	it('shows the Retry button when canRetry is true', () => {
		render(
			withQueryClient(
				<LaunchTaskNeedsHumanCallout
					linearIssueId="TEAM-1"
					taskId="task-1"
					headline="Auth required"
					hint="Sign in to Claude."
					blockingStep={blockingStep()}
					classification={{ kind: 'auth_required', provider: 'claude' }}
					canRetry
				/>
			)
		)
		expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
	})

	it('hides the Retry button when canRetry is false', () => {
		render(
			withQueryClient(
				<LaunchTaskNeedsHumanCallout
					linearIssueId="TEAM-1"
					taskId="task-1"
					headline="claude CLI not found"
					hint="Install the CLI locally."
					blockingStep={blockingStep({ status: 'failed' })}
					classification={{ kind: 'cli_missing', binary: 'claude', install_hint: 'brew install …' }}
					canRetry={false}
				/>
			)
		)
		expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
	})

	it('switches tone to danger for terminal classifications (cli_missing / spawn_error)', () => {
		const cases: FailureClassification[] = [
			{ kind: 'cli_missing', binary: 'claude', install_hint: 'brew …' },
			{ kind: 'spawn_error', detail: 'permission denied' }
		]
		for (const classification of cases) {
			const { container, unmount } = render(
				withQueryClient(
					<LaunchTaskNeedsHumanCallout
						linearIssueId="TEAM-1"
						taskId="task-1"
						headline="Headline"
						hint="Hint"
						blockingStep={blockingStep({ status: 'failed' })}
						classification={classification}
						canRetry={false}
					/>
				)
			)
			const wrapper = container.querySelector('div')
			expect(wrapper?.className).toMatch(/danger/)
			expect(wrapper?.className).not.toMatch(/needs/)
			unmount()
		}
	})

	it('keeps the warn tone for needs_human classifications', () => {
		const { container } = render(
			withQueryClient(
				<LaunchTaskNeedsHumanCallout
					linearIssueId="TEAM-1"
					taskId="task-1"
					headline="Auth required"
					hint="Sign in."
					blockingStep={blockingStep()}
					classification={{ kind: 'auth_required', provider: 'codex' }}
					canRetry
				/>
			)
		)
		const wrapper = container.querySelector('div')
		expect(wrapper?.className).toMatch(/needs/)
		expect(wrapper?.className).not.toMatch(/danger/)
	})

	it('falls back to the needs tone when classification is null (legacy rows)', () => {
		const { container } = render(
			withQueryClient(
				<LaunchTaskNeedsHumanCallout
					linearIssueId="TEAM-1"
					taskId="task-1"
					headline="Launch task waiting on you"
					hint="Reply in the chat."
					blockingStep={null}
					classification={null}
					canRetry
				/>
			)
		)
		const wrapper = container.querySelector('div')
		expect(wrapper?.className).toMatch(/needs/)
	})

	it('renders the chat CTA when no run is linked', () => {
		render(
			withQueryClient(
				<LaunchTaskNeedsHumanCallout
					linearIssueId="TEAM-1"
					taskId="task-1"
					headline="Headline"
					hint="Hint"
					blockingStep={blockingStep()}
					classification={null}
					canRetry={false}
				/>
			)
		)
		expect(screen.getByRole('button', { name: /open chat/i })).toBeInTheDocument()
	})
})
