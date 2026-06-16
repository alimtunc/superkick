import type { PriorityIconKind } from '@/types'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PriorityIcon } from './PriorityIcon'

const KINDS: readonly PriorityIconKind[] = ['none', 'urgent', 'high', 'medium', 'low']

const LABELS: Record<PriorityIconKind, string> = {
	none: 'No priority',
	urgent: 'Urgent priority',
	high: 'High priority',
	medium: 'Medium priority',
	low: 'Low priority'
}

describe('PriorityIcon', () => {
	it.each(KINDS)('renders %s with an aria-label and svg', (kind) => {
		render(<PriorityIcon kind={kind} />)
		const node = screen.getByRole('img', { name: LABELS[kind] })
		expect(node.tagName.toLowerCase()).toBe('svg')
	})

	it('honors the size prop', () => {
		render(<PriorityIcon kind="low" size={16} />)
		const node = screen.getByRole('img', { name: 'Low priority' })
		expect(node.getAttribute('width')).toBe('16')
		expect(node.getAttribute('height')).toBe('16')
	})
})
