import type { PriorityIconKind } from '@/types'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PriorityIcon, priorityIconKindFromValue } from './PriorityIcon'

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

describe('priorityIconKindFromValue', () => {
	it.each([
		[0, 'none'],
		[1, 'urgent'],
		[2, 'high'],
		[3, 'medium'],
		[4, 'low']
	] as const)('maps Linear priority %i to %s', (value, expected) => {
		expect(priorityIconKindFromValue(value)).toBe(expected)
	})

	it('falls back to none for unknown values', () => {
		expect(priorityIconKindFromValue(99)).toBe('none')
	})
})
