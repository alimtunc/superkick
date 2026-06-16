import type { StepResult } from '@/types'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { StepSummaryCard } from '../StepSummaryCard'

function result(overrides: Partial<StepResult> = {}): StepResult {
	return {
		status: overrides.status ?? 'completed',
		summary: overrides.summary ?? 'wired the new step result through the runtime',
		changed_files: overrides.changed_files ?? [],
		questions: overrides.questions ?? []
	}
}

describe('StepSummaryCard', () => {
	it('renders the summary text regardless of status', () => {
		render(<StepSummaryCard result={result({ summary: 'wired things' })} status="completed" />)
		expect(screen.getByText(/wired things/i)).toBeInTheDocument()
	})

	it('renders up to six changed files inline and shows "+N more" past the cap', () => {
		const files = Array.from({ length: 9 }, (_, index) => `crates/foo/src/lib_${index}.rs`)
		render(<StepSummaryCard result={result({ changed_files: files })} status="completed" />)
		for (const visible of files.slice(0, 6)) {
			expect(screen.getByText(visible)).toBeInTheDocument()
		}
		expect(screen.queryByText(files[6])).not.toBeInTheDocument()
		expect(screen.getByText(/\+3 more/i)).toBeInTheDocument()
	})

	it('hides the questions list on completed steps even when questions are present', () => {
		render(
			<StepSummaryCard
				result={result({ questions: ['Which migration ordering do you want?'] })}
				status="completed"
			/>
		)
		expect(screen.queryByText(/migration ordering/i)).not.toBeInTheDocument()
	})

	it('renders the questions list when the step is awaiting a human', () => {
		render(
			<StepSummaryCard
				result={result({
					questions: ['Pick storage backend?', 'Confirm rollout?']
				})}
				status="needs_human"
			/>
		)
		expect(screen.getByText(/Pick storage backend/i)).toBeInTheDocument()
		expect(screen.getByText(/Confirm rollout/i)).toBeInTheDocument()
	})
})
