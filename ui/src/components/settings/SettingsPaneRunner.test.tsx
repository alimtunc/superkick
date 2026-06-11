import type { ReactNode } from 'react'

import { SettingsPaneRunner } from '@/components/settings/SettingsPaneRunner'
import type { RunnerConfigResponse } from '@/types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	fetchRunnerConfig: vi.fn(),
	updateRunnerConfig: vi.fn(),
	toastSuccess: vi.fn(),
	toastError: vi.fn()
}))

vi.mock('@/api/config', async () => {
	const actual = await vi.importActual<typeof import('@/api/config')>('@/api/config')
	return {
		...actual,
		fetchRunnerConfig: mocks.fetchRunnerConfig,
		updateRunnerConfig: mocks.updateRunnerConfig
	}
})

vi.mock('sonner', () => ({
	toast: Object.assign(vi.fn(), {
		success: mocks.toastSuccess,
		error: mocks.toastError
	})
}))

const CONFIG: RunnerConfigResponse = {
	worktree_prefix: 'sup',
	base_branch: 'main',
	setup_commands: ['pnpm install'],
	requires_restart: false
}

function wrap(node: ReactNode) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
	})
	return <QueryClientProvider client={client}>{node}</QueryClientProvider>
}

beforeEach(() => {
	vi.clearAllMocks()
	mocks.fetchRunnerConfig.mockResolvedValue(CONFIG)
})

describe('SettingsPaneRunner', () => {
	it('seeds the form from the runner config query and keeps save disabled while pristine', async () => {
		render(wrap(<SettingsPaneRunner />))

		const prefix = (await screen.findByLabelText('Worktree prefix')) as HTMLInputElement
		expect(prefix.value).toBe('sup')
		expect((screen.getByLabelText('Base branch') as HTMLInputElement).value).toBe('main')
		expect((screen.getByLabelText('Setup commands') as HTMLTextAreaElement).value).toBe('pnpm install')
		expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
	})

	it('enables save on change and disables it again on an invalid prefix', async () => {
		const user = userEvent.setup()
		render(wrap(<SettingsPaneRunner />))

		const prefix = (await screen.findByLabelText('Worktree prefix')) as HTMLInputElement
		await user.clear(prefix)
		await user.type(prefix, 'sup-2')
		expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()

		await user.clear(prefix)
		await user.type(prefix, 'SUP')
		expect(screen.getByText('Use only lowercase letters, digits, ".", "_" and "-"')).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
	})

	it('saves the edited config and toasts on success', async () => {
		mocks.updateRunnerConfig.mockResolvedValue({ ...CONFIG, worktree_prefix: 'sup-2' })
		const user = userEvent.setup()
		render(wrap(<SettingsPaneRunner />))

		const prefix = (await screen.findByLabelText('Worktree prefix')) as HTMLInputElement
		await user.clear(prefix)
		await user.type(prefix, 'sup-2')
		await user.click(screen.getByRole('button', { name: 'Save' }))

		await waitFor(() => expect(mocks.updateRunnerConfig).toHaveBeenCalledTimes(1))
		expect(mocks.updateRunnerConfig.mock.calls[0][0]).toEqual({
			worktree_prefix: 'sup-2',
			base_branch: 'main',
			setup_commands: ['pnpm install']
		})
		await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('Saved'))
		expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
	})

	it('asks for a manual restart outside the desktop shell when a restart is required', async () => {
		mocks.updateRunnerConfig.mockResolvedValue({
			...CONFIG,
			base_branch: 'develop',
			requires_restart: true
		})
		const user = userEvent.setup()
		render(wrap(<SettingsPaneRunner />))

		const branch = (await screen.findByLabelText('Base branch')) as HTMLInputElement
		await user.clear(branch)
		await user.type(branch, 'develop')
		await user.click(screen.getByRole('button', { name: 'Save' }))

		await waitFor(() =>
			expect(mocks.toastSuccess).toHaveBeenCalledWith('Saved — restart the daemon to apply')
		)
		expect(screen.getByText('Restart the daemon to apply runner changes.')).toBeInTheDocument()
	})

	it('surfaces the backend validation message when the save fails', async () => {
		mocks.updateRunnerConfig.mockRejectedValue(new Error('worktree_prefix: must not end with "-"'))
		const user = userEvent.setup()
		render(wrap(<SettingsPaneRunner />))

		const prefix = (await screen.findByLabelText('Worktree prefix')) as HTMLInputElement
		await user.clear(prefix)
		await user.type(prefix, 'sup-2')
		await user.click(screen.getByRole('button', { name: 'Save' }))

		await waitFor(() =>
			expect(mocks.toastError).toHaveBeenCalledWith('worktree_prefix: must not end with "-"')
		)
	})
})
