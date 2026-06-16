import type { PrChecksSummary } from '@/types'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PrChecksBadge } from './PrChecksBadge'

function checks(overrides: Partial<PrChecksSummary> = {}): PrChecksSummary {
	return { state: 'passing', total: 3, passing: 3, failing: 0, pending: 0, ...overrides }
}

describe('PrChecksBadge', () => {
	it('summarizes passing checks', () => {
		render(<PrChecksBadge checks={checks()} />)
		expect(screen.getByText('3 checks passed')).toBeInTheDocument()
	})

	it('leads with failures when any check fails', () => {
		render(<PrChecksBadge checks={checks({ state: 'failing', passing: 1, failing: 2, total: 3 })} />)
		expect(screen.getByText('2 failing')).toBeInTheDocument()
	})

	it('reports pending checks when none have failed', () => {
		render(<PrChecksBadge checks={checks({ state: 'pending', passing: 1, pending: 1, total: 2 })} />)
		expect(screen.getByText('1 pending')).toBeInTheDocument()
	})
})
