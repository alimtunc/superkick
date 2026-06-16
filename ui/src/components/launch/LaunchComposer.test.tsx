import type { ReactNode } from 'react'

import { LaunchComposer } from '@/components/launch/LaunchComposer'
import { agentsQuery, issuesQuery, launchProfilesQuery } from '@/lib/queries'
import { useLaunchComposerState } from '@/stores/launchComposerState'
import type {
	Agent,
	CreateLaunchTaskRequest,
	LaunchProfile,
	LinearIssueListItem,
	ProfileStep,
	ServerConfigResponse
} from '@/types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	createLaunchTask: vi.fn(),
	useNavigate: vi.fn(() => vi.fn())
}))

vi.mock('@/api/launchTasks', async () => {
	const actual = await vi.importActual<typeof import('@/api/launchTasks')>('@/api/launchTasks')
	return { ...actual, createLaunchTask: mocks.createLaunchTask }
})
vi.mock('@tanstack/react-router', async () => {
	const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
	return { ...actual, useNavigate: mocks.useNavigate }
})

const CONFIG: ServerConfigResponse = {
	repo_slug: 'acme/widgets',
	base_branch: 'main',
	launch_profile: {
		use_worktree: true,
		default_instructions: '',
		handoff_instructions: '',
		auto_transition_in_progress: true
	}
}

const AGENTS: Agent[] = [
	{
		name: 'plan-bot',
		provider: 'claude',
		role: 'planner',
		model: 'sonnet-4.6',
		runner_mode: 'interactive_pty',
		executor: 'interactive_pty',
		default_reasoning: 'medium',
		enabled: true,
		billing_profile: 'subscription',
		origin: 'custom',
		avatar: null,
		description: null
	}
]

const CUSTOM_PROFILE: LaunchProfile = {
	id: 'custom',
	name: 'Custom',
	kind: 'custom',
	is_default: true,
	is_readonly: true,
	steps: []
}

const ISSUE: LinearIssueListItem = {
	id: 'issue-uuid-1',
	identifier: 'SUP-159',
	title: 'Composer execution target',
	url: 'https://linear.app/superkick/issue/SUP-159',
	priority: { value: 2, label: 'High' },
	status: { state_type: 'started', name: 'In Progress', color: '#5b6ef2' },
	team_id: null,
	labels: [],
	assignee: null,
	project: null,
	parent: null,
	children: [],
	blocked_by: [],
	created_at: '2026-05-21T00:00:00Z',
	updated_at: '2026-05-21T00:00:00Z',
	completed_at: null
}

function agentStep(): ProfileStep {
	return {
		ordering: 1,
		label: 'plan-bot',
		skill_ref: 'implement',
		agent_ref: 'plan-bot',
		provider: 'claude',
		model: 'sonnet-4.6',
		reasoning: 'medium',
		executor: 'interactive_pty',
		session_policy: 'fresh',
		output_expectation: 'patch',
		enabled: true
	}
}

function buildClient(overrides: { config?: ServerConfigResponse; issues?: LinearIssueListItem[] } = {}) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
	})
	client.setQueryData(['config'], overrides.config ?? CONFIG)
	client.setQueryData(agentsQuery().queryKey, AGENTS)
	client.setQueryData(launchProfilesQuery().queryKey, [CUSTOM_PROFILE])
	client.setQueryData(issuesQuery().queryKey, {
		issues: overrides.issues ?? [ISSUE],
		total_count: (overrides.issues ?? [ISSUE]).length
	})
	return client
}

function wrap(node: ReactNode, client = buildClient()) {
	return <QueryClientProvider client={client}>{node}</QueryClientProvider>
}

/** Seed the composer store with one enabled agent step so Launch is enabled —
 *  the composer's mount effect skips re-selecting once `profileId` is set. */
function seedAgentStep() {
	useLaunchComposerState.setState({ profileId: 'custom', steps: [agentStep()] })
}

async function pickIssue(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole('combobox', { name: 'Select issue' }))
	await user.click(await screen.findByText('SUP-159'))
}

describe('LaunchComposer', () => {
	beforeEach(() => {
		useLaunchComposerState.getState().reset()
		mocks.createLaunchTask.mockReset()
		mocks.createLaunchTask.mockResolvedValue({
			task: {
				id: 'task-uuid-1',
				linear_issue_id: 'SUP-159',
				recipe_kind: 'dynamic',
				status: 'pending',
				current_step_id: null,
				summary: null,
				created_at: '2026-05-21T00:00:00Z',
				updated_at: '2026-05-21T00:00:00Z'
			},
			steps: []
		})
	})

	afterEach(() => {
		useLaunchComposerState.getState().reset()
	})

	it('renders execution-target controls seeded from server config', () => {
		render(wrap(<LaunchComposer issue={null} prefill="ship the composer" />))

		expect(screen.getByRole('button', { name: 'Base branch: main' })).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Worktree strategy: new worktree' })).toBeInTheDocument()

		const destination = screen.getByLabelText('Execution destination')
		expect(destination).toHaveTextContent('new worktree from base')
		expect(destination).toHaveTextContent('acme/widgets')
		expect(destination).toHaveTextContent('main')
	})

	it('offers an Add agent step control', () => {
		render(wrap(<LaunchComposer issue={null} prefill="ship the composer" />))
		expect(screen.getByRole('button', { name: 'Add agent step' })).toBeInTheDocument()
	})

	it('keeps Launch disabled until an enabled step has an agent', async () => {
		render(wrap(<LaunchComposer issue={null} prefill="ship the composer" />))
		await pickIssue(userEvent.setup())
		// No agent steps yet → launch is blocked.
		expect(screen.getByRole('button', { name: 'Launch task' })).toBeDisabled()
	})

	it('submits a dynamic payload with the custom profile + agent step overrides', async () => {
		const user = userEvent.setup()
		seedAgentStep()
		render(wrap(<LaunchComposer issue={null} prefill="ship the composer" />))

		await pickIssue(user)
		await user.click(screen.getByRole('button', { name: 'Launch task' }))

		await waitFor(() => expect(mocks.createLaunchTask).toHaveBeenCalledTimes(1))
		const payload = mocks.createLaunchTask.mock.calls[0][0] as CreateLaunchTaskRequest
		expect(payload.linear_issue_id).toBe('SUP-159')
		expect(payload.profile_id).toBe('custom')
		expect(payload.base_branch).toBe('main')
		expect(payload.use_worktree).toBe(true)
		expect(payload.step_overrides?.[0]?.agent_ref).toBe('plan-bot')
	})

	it('persists operator overrides into the submit payload', async () => {
		const user = userEvent.setup()
		seedAgentStep()
		render(wrap(<LaunchComposer issue={null} prefill="ship the composer" />))

		await pickIssue(user)

		await user.click(screen.getByRole('button', { name: 'Worktree strategy: new worktree' }))
		await user.click(await screen.findByText('current checkout'))
		await waitFor(() => {
			expect(
				screen.getByRole('button', { name: 'Worktree strategy: current checkout' })
			).toBeInTheDocument()
		})

		await user.click(screen.getByRole('button', { name: 'Base branch: main' }))
		const input = await screen.findByLabelText('Base branch name')
		await user.clear(input)
		await user.type(input, 'release/2026.q2')
		await user.click(screen.getByRole('button', { name: 'Apply' }))
		await waitFor(() => {
			expect(screen.getByRole('button', { name: 'Base branch: release/2026.q2' })).toBeInTheDocument()
		})

		await user.click(screen.getByRole('button', { name: 'Launch task' }))

		await waitFor(() => expect(mocks.createLaunchTask).toHaveBeenCalledTimes(1))
		const payload = mocks.createLaunchTask.mock.calls[0][0] as CreateLaunchTaskRequest
		expect(payload.base_branch).toBe('release/2026.q2')
		expect(payload.use_worktree).toBe(false)
	})

	it('reflects the override choice in the destination preview', async () => {
		const user = userEvent.setup()
		render(wrap(<LaunchComposer issue={null} prefill="ship the composer" />))

		await user.click(screen.getByRole('button', { name: 'Worktree strategy: new worktree' }))
		await user.click(await screen.findByText('current checkout'))

		await waitFor(() => {
			const destination = screen.getByLabelText('Execution destination')
			expect(destination).toHaveTextContent('current checkout on base')
		})
	})

	it('blocks the Apply button when the base branch field is blank', async () => {
		const user = userEvent.setup()
		render(wrap(<LaunchComposer issue={null} prefill="ship the composer" />))

		await user.click(screen.getByRole('button', { name: 'Base branch: main' }))
		const input = await screen.findByLabelText('Base branch name')
		await user.clear(input)
		expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
	})

	it('seeds base branch from a non-default config value', () => {
		const client = buildClient({
			config: { ...CONFIG, base_branch: 'develop' }
		})
		render(wrap(<LaunchComposer issue={null} prefill="ship the composer" />, client))

		expect(screen.getByRole('button', { name: 'Base branch: develop' })).toBeInTheDocument()
	})

	it('seeds worktree strategy from launch profile (use_worktree=false ⇒ current checkout)', () => {
		const client = buildClient({
			config: {
				...CONFIG,
				launch_profile: { ...CONFIG.launch_profile, use_worktree: false }
			}
		})
		render(wrap(<LaunchComposer issue={null} prefill="ship the composer" />, client))

		expect(
			screen.getByRole('button', { name: 'Worktree strategy: current checkout' })
		).toBeInTheDocument()
	})
})
