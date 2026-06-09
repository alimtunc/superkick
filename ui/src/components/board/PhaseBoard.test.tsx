import { toPhaseColumns } from '@/lib/domain'
import type { OperatorQueue, QueueRunSummary } from '@/types'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PhaseBoard } from './PhaseBoard'

const EMPTY_GROUPS: Record<OperatorQueue, QueueRunSummary[]> = {
	waiting: [],
	active: [],
	'in-pr': [],
	done: [],
	'blocked-by-dependency': [],
	'needs-human': []
}

describe('PhaseBoard', () => {
	it('renders the six phase columns in pipeline order', () => {
		render(<PhaseBoard columns={toPhaseColumns(EMPTY_GROUPS)} refTime={0} />)
		const headers = screen.getAllByText(/^(Queued|Planning|Coding|Review|PR|Done)$/)
		expect(headers.map((h) => h.textContent)).toEqual([
			'Queued',
			'Planning',
			'Coding',
			'Review',
			'PR',
			'Done'
		])
	})

	it('shows an empty state in every column when there is no work', () => {
		render(<PhaseBoard columns={toPhaseColumns(EMPTY_GROUPS)} refTime={0} />)
		expect(screen.getAllByText('Nothing here.')).toHaveLength(6)
	})
})
