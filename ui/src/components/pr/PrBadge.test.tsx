import type { LinkedPrSummary } from '@/types'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PrBadge } from './PrBadge'

function pr(overrides: Partial<LinkedPrSummary> = {}): LinkedPrSummary {
	return {
		number: 182,
		url: 'https://github.com/o/r/pull/182',
		state: 'draft',
		merged_at: null,
		...overrides
	}
}

describe('PrBadge', () => {
	it('renders the PR number and exposes the state via title', () => {
		render(<PrBadge pr={pr()} />)
		expect(screen.getByText('#182')).toBeInTheDocument()
		expect(screen.getByTitle(/Pull request #182 · draft/)).toBeInTheDocument()
	})

	it('reflects an open PR', () => {
		render(<PrBadge pr={pr({ number: 7, state: 'open' })} />)
		expect(screen.getByText('#7')).toBeInTheDocument()
		expect(screen.getByTitle(/· open/)).toBeInTheDocument()
	})
})
