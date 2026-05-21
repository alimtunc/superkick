import type { LinearStateType, StatusIconKind } from '@/types'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { StatusIcon, statusIconKindFromLinear } from './StatusIcon'

const KINDS: readonly StatusIconKind[] = [
	'backlog',
	'todo',
	'progress',
	'needs',
	'review',
	'done',
	'cancelled'
]

const LABELS: Record<StatusIconKind, string> = {
	backlog: 'Backlog',
	todo: 'Todo',
	progress: 'In progress',
	needs: 'Needs human',
	review: 'In review',
	done: 'Done',
	cancelled: 'Cancelled'
}

describe('StatusIcon', () => {
	it.each(KINDS)('renders %s with an aria-label and svg', (kind) => {
		render(<StatusIcon kind={kind} />)
		const node = screen.getByRole('img', { name: LABELS[kind] })
		expect(node.tagName.toLowerCase()).toBe('svg')
	})

	it('honors the size prop', () => {
		render(<StatusIcon kind="todo" size={16} />)
		const node = screen.getByRole('img', { name: 'Todo' })
		expect(node.getAttribute('width')).toBe('16')
		expect(node.getAttribute('height')).toBe('16')
	})

	it('applies an explicit color via inline style and drops the tone class', () => {
		render(<StatusIcon kind="progress" color="#ff0000" />)
		const node = screen.getByRole('img', { name: 'In progress' })
		expect(node.getAttribute('style')).toContain('color: rgb(255, 0, 0)')
		expect(node.getAttribute('class') ?? '').not.toContain('text-info')
	})
})

describe('statusIconKindFromLinear', () => {
	it.each<[LinearStateType, StatusIconKind]>([
		['backlog', 'backlog'],
		['unstarted', 'todo'],
		['started', 'progress'],
		['completed', 'done'],
		['canceled', 'cancelled']
	])('maps Linear state %s to %s', (stateType, expected) => {
		expect(statusIconKindFromLinear(stateType)).toBe(expected)
	})
})
