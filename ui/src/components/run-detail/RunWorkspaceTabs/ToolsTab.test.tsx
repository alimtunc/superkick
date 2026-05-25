import type { ReactNode } from 'react'

import { ToolsTab } from '@/components/run-detail/RunWorkspaceTabs/ToolsTab'
import type { RunToolCall } from '@/types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	fetchRunToolCalls: vi.fn<(runId: string) => Promise<RunToolCall[]>>()
}))

vi.mock('@/api', async () => {
	const actual = await vi.importActual<typeof import('@/api')>('@/api')
	return { ...actual, fetchRunToolCalls: mocks.fetchRunToolCalls }
})

function wrap(node: ReactNode) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
	})
	return <QueryClientProvider client={client}>{node}</QueryClientProvider>
}

beforeEach(() => {
	mocks.fetchRunToolCalls.mockReset()
})

describe('ToolsTab', () => {
	it('renders the honest empty state when no tool calls exist', async () => {
		mocks.fetchRunToolCalls.mockResolvedValue([])
		render(wrap(<ToolsTab runId="run-1" />))

		await waitFor(() => {
			expect(screen.getByText('No tool calls yet')).toBeInTheDocument()
		})
	})

	it('renders a row per tool call and expands input/output on click', async () => {
		mocks.fetchRunToolCalls.mockResolvedValue([
			{
				call_id: 'c1',
				tool_name: 'Read',
				conversation_id: 'conv-1',
				turn_id: 'turn-1',
				at: '2026-05-25T10:00:00.000Z',
				input: { path: '/tmp/foo' },
				output: 'file contents',
				is_error: false
			}
		])
		const user = userEvent.setup()
		render(wrap(<ToolsTab runId="run-1" />))

		const row = await screen.findByRole('button', { name: /Read/ })
		await user.click(row)

		expect(screen.getByText('input')).toBeInTheDocument()
		expect(screen.getByText('output')).toBeInTheDocument()
		expect(screen.getByText(/"path": "\/tmp\/foo"/)).toBeInTheDocument()
		expect(screen.getByText('file contents')).toBeInTheDocument()
	})

	it('shows a "running…" hint and omits output when no result is paired yet', async () => {
		mocks.fetchRunToolCalls.mockResolvedValue([
			{
				call_id: 'c2',
				tool_name: 'Bash',
				conversation_id: 'conv-1',
				turn_id: 'turn-2',
				at: '2026-05-25T10:01:00.000Z',
				input: { cmd: 'ls' },
				output: null,
				is_error: false
			}
		])
		const user = userEvent.setup()
		render(wrap(<ToolsTab runId="run-1" />))

		await screen.findByRole('button', { name: /Bash/ })
		expect(screen.getByText('running…')).toBeInTheDocument()

		await user.click(screen.getByRole('button', { name: /Bash/ }))
		expect(screen.queryByText('output')).not.toBeInTheDocument()
		expect(screen.getByText('No result captured yet.')).toBeInTheDocument()
	})

	it('marks rows with is_error=true visibly', async () => {
		mocks.fetchRunToolCalls.mockResolvedValue([
			{
				call_id: 'c3',
				tool_name: 'Edit',
				conversation_id: 'conv-1',
				turn_id: 'turn-3',
				at: '2026-05-25T10:02:00.000Z',
				input: { file: 'x' },
				output: 'permission denied',
				is_error: true
			}
		])
		render(wrap(<ToolsTab runId="run-1" />))
		await screen.findByRole('button', { name: /Edit/ })
		expect(screen.getByText('error')).toBeInTheDocument()
	})
})
