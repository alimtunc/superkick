import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ExternalLink } from './external-link'

const hooks = vi.hoisted(() => ({ isDesktopShell: vi.fn(), openExternal: vi.fn() }))

vi.mock('@/lib/desktop', () => ({ isDesktopShell: () => hooks.isDesktopShell() }))
vi.mock('@/lib/openExternal', () => ({ openExternal: (url: string) => hooks.openExternal(url) }))

describe('ExternalLink', () => {
	afterEach(() => {
		vi.clearAllMocks()
	})

	it('renders a real anchor with a safe target and rel', () => {
		hooks.isDesktopShell.mockReturnValue(false)
		render(<ExternalLink href="https://example.com">GitHub</ExternalLink>)
		const link = screen.getByRole('link', { name: 'GitHub' })
		expect(link).toHaveAttribute('href', 'https://example.com')
		expect(link).toHaveAttribute('target', '_blank')
		expect(link).toHaveAttribute('rel', 'noopener noreferrer')
	})

	it('intercepts the click and opens via the helper in the desktop shell', () => {
		hooks.isDesktopShell.mockReturnValue(true)
		render(<ExternalLink href="https://example.com/pr/1">GitHub</ExternalLink>)
		const event = new MouseEvent('click', { bubbles: true, cancelable: true })
		fireEvent(screen.getByRole('link'), event)
		expect(event.defaultPrevented).toBe(true)
		expect(hooks.openExternal).toHaveBeenCalledWith('https://example.com/pr/1')
	})

	it('does not intercept modified clicks (keeps native open-in-new-tab)', () => {
		hooks.isDesktopShell.mockReturnValue(true)
		render(<ExternalLink href="https://example.com">GitHub</ExternalLink>)
		const event = new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true })
		fireEvent(screen.getByRole('link'), event)
		expect(event.defaultPrevented).toBe(false)
		expect(hooks.openExternal).not.toHaveBeenCalled()
	})
})
