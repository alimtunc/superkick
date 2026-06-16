import type { ReactNode } from 'react'

import { InterventionComposer } from '@/domains/launch/components/InterventionComposer'
import type { LaunchTaskIntervention } from '@/types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	createLaunchTaskIntervention: vi.fn()
}))

vi.mock('@/api/launchTasks', async () => {
	const actual = await vi.importActual<typeof import('@/api/launchTasks')>('@/api/launchTasks')
	return {
		...actual,
		createLaunchTaskIntervention: mocks.createLaunchTaskIntervention
	}
})

vi.mock('sonner', () => ({
	toast: Object.assign(vi.fn(), {
		error: vi.fn(),
		success: vi.fn()
	})
}))

const TASK_ID = '11111111-1111-1111-1111-111111111111'
const ISSUE_ID = 'SUP-154'

function wrap(node: ReactNode) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
	})
	return <QueryClientProvider client={client}>{node}</QueryClientProvider>
}

function intervention(overrides: Partial<LaunchTaskIntervention> = {}): LaunchTaskIntervention {
	return {
		id: '22222222-2222-2222-2222-222222222222',
		launch_task_id: TASK_ID,
		target_step_id: null,
		author: 'operator',
		body: 'do x',
		created_at: new Date().toISOString(),
		consumed_at: null,
		...overrides
	}
}

describe('InterventionComposer', () => {
	beforeEach(() => {
		mocks.createLaunchTaskIntervention.mockReset()
	})

	it('disables Send while the textarea is empty', () => {
		render(wrap(<InterventionComposer linearIssueId={ISSUE_ID} taskId={TASK_ID} disabled={false} />))
		const send = screen.getByRole('button', { name: /send intervention/i })
		expect(send).toBeDisabled()
	})

	it('sends a trimmed body and clears the textarea on success', async () => {
		mocks.createLaunchTaskIntervention.mockResolvedValueOnce(intervention())
		const user = userEvent.setup()
		render(wrap(<InterventionComposer linearIssueId={ISSUE_ID} taskId={TASK_ID} disabled={false} />))

		const textarea = screen.getByLabelText('Intervention body') as HTMLTextAreaElement
		await user.type(textarea, '  watch the failing tests  ')
		const send = screen.getByRole('button', { name: /send intervention/i })
		expect(send).not.toBeDisabled()

		await user.click(send)

		await waitFor(() => {
			expect(mocks.createLaunchTaskIntervention).toHaveBeenCalledWith(TASK_ID, {
				body: 'watch the failing tests'
			})
		})
		expect(textarea.value).toBe('')
	})

	it('shows a disabled state with a terminal-task hint when disabled prop is true', () => {
		render(wrap(<InterventionComposer linearIssueId={ISSUE_ID} taskId={TASK_ID} disabled={true} />))
		const textarea = screen.getByLabelText('Intervention body')
		expect(textarea).toBeDisabled()
		expect(textarea).toHaveAttribute('placeholder', expect.stringContaining('Launch task has ended'))
		expect(screen.getByRole('button', { name: /send intervention/i })).toBeDisabled()
	})
})
