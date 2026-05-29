import type { TaskBadgeKind } from '@/types'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { TaskBadge } from './TaskBadge'

const KINDS: readonly TaskBadgeKind[] = ['needs', 'running', 'review', 'shipped']

const DEFAULT_LABELS: Record<TaskBadgeKind, string> = {
	needs: 'needs you',
	running: 'running',
	review: 'in review',
	shipped: 'shipped'
}

describe('TaskBadge', () => {
	it.each(KINDS)('renders %s with the default label', (kind) => {
		render(<TaskBadge kind={kind} />)
		expect(screen.getByText(DEFAULT_LABELS[kind])).toBeInTheDocument()
	})

	it('renders a custom label when provided', () => {
		render(<TaskBadge kind="running" label="implement · 2m" />)
		expect(screen.getByText('implement · 2m')).toBeInTheDocument()
	})

	it('renders nothing when kind is null', () => {
		const { container } = render(<TaskBadge kind={null} />)
		expect(container).toBeEmptyDOMElement()
	})

	it('renders nothing when kind is undefined', () => {
		const { container } = render(<TaskBadge kind={undefined} />)
		expect(container).toBeEmptyDOMElement()
	})

	it('pulses only on the running kind', () => {
		const { container: runningContainer } = render(<TaskBadge kind="running" />)
		expect(runningContainer.querySelector('.sk-pulse')).not.toBeNull()
		expect(runningContainer.querySelector('.motion-reduce\\:animate-none')).not.toBeNull()

		const { container: needsContainer } = render(<TaskBadge kind="needs" />)
		expect(needsContainer.querySelector('.sk-pulse')).toBeNull()

		const { container: reviewContainer } = render(<TaskBadge kind="review" />)
		expect(reviewContainer.querySelector('.sk-pulse')).toBeNull()

		const { container: shippedContainer } = render(<TaskBadge kind="shipped" />)
		expect(shippedContainer.querySelector('.sk-pulse')).toBeNull()
	})
})
