import { LedgerRow } from '@/components/run-detail/LedgerRow'
import { categoryOf } from '@/lib/domain'
import type { RunEvent } from '@/types'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

function buildEvent(overrides: Partial<RunEvent> = {}): RunEvent {
	return {
		id: 'evt-1',
		run_id: 'run-1',
		run_step_id: null,
		ts: '2026-05-25T10:00:00.000Z',
		kind: 'terminal_takeover_opened',
		level: 'info',
		message: 'fallback',
		payload_json: null,
		...overrides
	}
}

describe('LedgerRow — terminal takeover events', () => {
	it('classifies terminal_takeover_opened under the ownership category', () => {
		expect(categoryOf('terminal_takeover_opened')).toBe('ownership')
		expect(categoryOf('terminal_takeover_closed')).toBe('ownership')
	})

	it('renders the new title and the Ownership category label', () => {
		render(
			<LedgerRow
				event={buildEvent({ kind: 'terminal_takeover_opened' })}
				sessionById={new Map()}
				attentionById={new Map()}
			/>
		)

		expect(screen.getByText('Ownership')).toBeInTheDocument()
		expect(screen.getByText('Operator opened terminal takeover')).toBeInTheDocument()
	})

	it('surfaces the reason payload field on terminal_takeover_closed via ledgerDetail', () => {
		render(
			<LedgerRow
				event={buildEvent({
					kind: 'terminal_takeover_closed',
					payload_json: { mode: 'inspect', reason: 'operator closed window' }
				})}
				sessionById={new Map()}
				attentionById={new Map()}
			/>
		)

		expect(screen.getByText('Operator closed terminal takeover')).toBeInTheDocument()
		expect(screen.getByText(/operator closed window/)).toBeInTheDocument()
	})
})
