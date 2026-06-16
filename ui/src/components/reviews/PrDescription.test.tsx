import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PrDescription } from './PrDescription'

describe('PrDescription', () => {
	it('renders the PR body as markdown prose', () => {
		render(<PrDescription body={'## Changes\n\n- Added `data-testid`\n- Fixed the thing'} />)
		expect(screen.getByRole('heading', { name: 'Changes' })).toBeInTheDocument()
		expect(screen.getByText(/Fixed the thing/)).toBeInTheDocument()
	})

	it('renders nothing for an empty body', () => {
		const { container } = render(<PrDescription body={'   '} />)
		expect(container).toBeEmptyDOMElement()
	})
})
