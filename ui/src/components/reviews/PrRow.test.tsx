import type { ReactNode } from 'react'

import type { PrInboxItem } from '@/types'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PrRow } from './PrRow'

vi.mock('@tanstack/react-router', () => ({
	Link: ({ children, ...rest }: { children: ReactNode } & Record<string, unknown>) => {
		const { to: _to, params: _params, ...attrs } = rest
		void _to
		void _params
		return (
			<a href="#" {...(attrs as Record<string, string>)}>
				{children}
			</a>
		)
	}
}))

function pr(overrides: Partial<PrInboxItem> = {}): PrInboxItem {
	return {
		repoSlug: 'acme/superkick',
		number: 42,
		title: 'fix(contact): masquer l’email de la ligne contact quand un numéro existe',
		url: 'https://github.com/acme/superkick/pull/42',
		state: 'open',
		isDraft: false,
		author: 'alim',
		headBranch: 'fix/contact-email',
		baseBranch: 'main',
		headSha: 'abc123',
		reviewers: [{ login: 'meyer', state: 'approved' }],
		reviewDecision: 'approved',
		reviewCommentCount: 0,
		bucket: 'ready_to_merge',
		updatedAt: '2026-06-14T10:00:00Z',
		...overrides
	}
}

describe('PrRow', () => {
	it('renders the full title, branch, author and status as a card', () => {
		render(<PrRow pr={pr()} />)
		expect(
			screen.getByText('fix(contact): masquer l’email de la ligne contact quand un numéro existe')
		).toBeInTheDocument()
		expect(screen.getByText('fix/contact-email')).toBeInTheDocument()
		expect(screen.getByText('alim')).toBeInTheDocument()
		expect(screen.getByText('Ready for merge')).toBeInTheDocument()
		expect(screen.getByText('1 reviewer')).toBeInTheDocument()
	})

	it('shows the CI checks summary when present', () => {
		render(
			<PrRow pr={pr({ checks: { state: 'failing', total: 3, passing: 1, failing: 2, pending: 0 } })} />
		)
		expect(screen.getByText('2 failing')).toBeInTheDocument()
	})

	it('omits the checks badge when no CI data is available', () => {
		render(<PrRow pr={pr({ checks: null })} />)
		expect(screen.queryByText(/passed|failing|pending/)).toBeNull()
	})
})
