import type { IssuePrDiffFile, PrInboxItem } from '@/types'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { PrReviewRail } from './PrReviewRail'

function pr(overrides: Partial<PrInboxItem> = {}): PrInboxItem {
	return {
		repoSlug: 'acme/superkick',
		number: 7,
		title: 'fix: thing',
		url: 'https://github.com/acme/superkick/pull/7',
		state: 'open',
		isDraft: false,
		author: 'alim',
		headBranch: 'fix/thing',
		baseBranch: 'main',
		headSha: 'abc123',
		reviewers: [
			{ login: 'meyer', state: 'approved' },
			{ login: 'fawsy', state: 'changes_requested' }
		],
		reviewDecision: 'changes_requested',
		reviewCommentCount: 0,
		bucket: 'changes_requested',
		updatedAt: '2026-06-14T10:00:00Z',
		...overrides
	}
}

const files: IssuePrDiffFile[] = [
	{
		path: 'ui/src/components/reviews/PrReviewRail.tsx',
		status: 'added',
		additions: 12,
		deletions: 0,
		position: 0
	},
	{ path: 'ui/src/api/reviews.ts', status: 'modified', additions: 3, deletions: 6, position: 1 }
]

describe('PrReviewRail', () => {
	it('renders the derived status, reviewers with their states, and changed files', () => {
		render(<PrReviewRail pr={pr()} diffFiles={files} diffLoading={false} onOpenDiff={() => {}} />)

		expect(screen.getByText('Reviewers')).toBeInTheDocument()
		expect(screen.getByText('meyer')).toBeInTheDocument()
		expect(screen.getByText('fawsy')).toBeInTheDocument()
		expect(screen.getByText('Approved')).toBeInTheDocument()
		// status pill + reviewer chip both say "Changes requested"
		expect(screen.getAllByText('Changes requested').length).toBeGreaterThanOrEqual(2)

		expect(screen.getByText('Files changed · 2')).toBeInTheDocument()
		expect(screen.getByText('PrReviewRail.tsx')).toBeInTheDocument()
		expect(screen.getByText('+12')).toBeInTheDocument()
		expect(screen.getByText('−6')).toBeInTheDocument()
	})

	it('omits the Checks section (no CI data) and Resolves when no issue is linked', () => {
		render(<PrReviewRail pr={pr()} diffFiles={files} diffLoading={false} onOpenDiff={() => {}} />)
		expect(screen.queryByText('Checks')).toBeNull()
		expect(screen.queryByText('Resolves')).toBeNull()
	})

	it('shows a discreet empty when there are no reviewers', () => {
		render(
			<PrReviewRail
				pr={pr({ reviewers: [] })}
				diffFiles={[]}
				diffLoading={false}
				onOpenDiff={() => {}}
			/>
		)
		expect(screen.getByText('No reviewers assigned')).toBeInTheDocument()
	})

	it('switches to the Diff tab when a file is clicked', async () => {
		const onOpenDiff = vi.fn()
		const user = userEvent.setup()
		render(<PrReviewRail pr={pr()} diffFiles={files} diffLoading={false} onOpenDiff={onOpenDiff} />)
		await user.click(screen.getByText('PrReviewRail.tsx'))
		expect(onOpenDiff).toHaveBeenCalledTimes(1)
	})
})
