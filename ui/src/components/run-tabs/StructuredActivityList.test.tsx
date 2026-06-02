import type { RunEvent } from '@/types'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { hasStructuredActivity } from './structuredActivity'
import { StructuredActivityList } from './StructuredActivityList'

function event(overrides: Partial<RunEvent>): RunEvent {
	return {
		id: 'event-1',
		run_id: 'run-1',
		run_step_id: 'step-1',
		seq: 0,
		ts: '2026-05-24T14:00:00.000Z',
		kind: 'command_output',
		level: 'info',
		message: 'go test ./internal/webhook/ -run Signature -v',
		payload_json: {
			activity_kind: 'test',
			status: 'fail',
			badge: '1 fail',
			tests: [{ name: 'TestWebhookSignatureDrift', result: 'fail' }]
		},
		...overrides
	}
}

describe('StructuredActivityList', () => {
	it('detects structured activity payloads', () => {
		expect(hasStructuredActivity([event({})])).toBe(true)
		expect(hasStructuredActivity([event({ payload_json: { step_key: 'code' } })])).toBe(false)
	})

	it('renders command evidence and test output', () => {
		render(<StructuredActivityList events={[event({})]} />)

		expect(screen.getByText('go test ./internal/webhook/ -run Signature -v')).toBeInTheDocument()
		expect(screen.getByText('1 fail')).toBeInTheDocument()
		expect(screen.getByText('TestWebhookSignatureDrift')).toBeInTheDocument()
	})
})
