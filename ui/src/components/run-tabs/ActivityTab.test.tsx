import { ActivityTab } from '@/components/run-tabs/ActivityTab'
import type { ProtocolEvent, RunEvent } from '@/types'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

function baseEvent(overrides: Partial<RunEvent>): RunEvent {
	return {
		id: 'evt-1',
		run_id: 'run-1',
		run_step_id: 'step-1',
		seq: 0,
		ts: '2026-06-01T10:00:00.000Z',
		kind: 'step_started',
		level: 'info',
		message: 'Code step started',
		payload_json: { step_key: 'code' },
		...overrides
	}
}

function protocolEvent(event: ProtocolEvent, seq: number): RunEvent {
	return baseEvent({
		id: `proto-${seq}`,
		seq,
		kind: 'agent_protocol',
		message: 'protocol',
		payload_json: { seq, at: '2026-06-01T10:00:00.000Z', ...event }
	})
}

describe('ActivityTab', () => {
	it('renders the ledger for a legacy run with no protocol events', () => {
		render(<ActivityTab events={[baseEvent({})]} sessions={[]} attentionRequests={[]} />)

		expect(screen.getByText('Code step started')).toBeInTheDocument()
		expect(screen.getByText('Step')).toBeInTheDocument()
	})

	it('renders the protocol activity list when the run has agent_protocol events', () => {
		render(
			<ActivityTab
				events={[
					protocolEvent({ kind: 'tool_use', call_id: 'c1', tool_name: 'apply_patch', input: {} }, 1)
				]}
				sessions={[]}
				attentionRequests={[]}
			/>
		)

		expect(screen.getByText('apply_patch')).toBeInTheDocument()
		expect(screen.queryByText('Code step started')).not.toBeInTheDocument()
	})

	it('shows the empty state when there is no activity at all', () => {
		render(<ActivityTab events={[]} sessions={[]} attentionRequests={[]} />)
		expect(screen.getByText('No activity yet')).toBeInTheDocument()
	})
})
