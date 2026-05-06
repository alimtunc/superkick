import type { TakeoverModeAvailability, TakeoverModeKind } from '@/types'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { TerminalTakeoverModeButton } from './TerminalTakeoverModeButton'

function availability(
	overrides: Partial<TakeoverModeAvailability> & { mode: TakeoverModeKind }
): TakeoverModeAvailability {
	return {
		available: true,
		reason: null,
		resume_supported: false,
		...overrides
	}
}

describe('TerminalTakeoverModeButton', () => {
	it('shows "Resume available" for interactive_continuation when resume_supported', () => {
		render(
			<TerminalTakeoverModeButton
				availability={availability({ mode: 'interactive_continuation', resume_supported: true })}
				icon={<span />}
				label="Continue"
				description="provider CLI"
				pending={false}
				onSelect={() => {}}
			/>
		)
		expect(screen.getByText('Resume available')).toBeInTheDocument()
	})

	it('shows "Resume not supported" for interactive_continuation when not supported', () => {
		render(
			<TerminalTakeoverModeButton
				availability={availability({ mode: 'interactive_continuation', resume_supported: false })}
				icon={<span />}
				label="Continue"
				description="provider CLI"
				pending={false}
				onSelect={() => {}}
			/>
		)
		expect(screen.getByText('Resume not supported')).toBeInTheDocument()
	})

	it('omits the resume badge for inspect and force_takeover modes', () => {
		const { rerender } = render(
			<TerminalTakeoverModeButton
				availability={availability({ mode: 'inspect' })}
				icon={<span />}
				label="Inspect"
				description="read-only shell"
				pending={false}
				onSelect={() => {}}
			/>
		)
		expect(screen.queryByText(/Resume/)).not.toBeInTheDocument()

		rerender(
			<TerminalTakeoverModeButton
				availability={availability({ mode: 'force_takeover' })}
				icon={<span />}
				label="Force takeover"
				description="cancel turn"
				pending={false}
				onSelect={() => {}}
			/>
		)
		expect(screen.queryByText(/Resume/)).not.toBeInTheDocument()
	})

	it('surfaces availability.reason verbatim when disabled', () => {
		render(
			<TerminalTakeoverModeButton
				availability={availability({
					mode: 'force_takeover',
					available: false,
					reason: 'no active turn'
				})}
				icon={<span />}
				label="Force takeover"
				description="cancel turn"
				pending={false}
				onSelect={() => {}}
			/>
		)
		expect(screen.getByText(/Unavailable: no active turn/)).toBeInTheDocument()
		expect(screen.getByRole('button')).toBeDisabled()
	})

	it('disables the button while pending and skips onSelect', () => {
		const onSelect = vi.fn()
		render(
			<TerminalTakeoverModeButton
				availability={availability({ mode: 'inspect' })}
				icon={<span />}
				label="Inspect"
				description="read-only shell"
				pending={true}
				onSelect={onSelect}
			/>
		)
		const button = screen.getByRole('button')
		expect(button).toBeDisabled()
		button.click()
		expect(onSelect).not.toHaveBeenCalled()
	})

	it('fires onSelect with the mode kind when clicked', () => {
		const onSelect = vi.fn()
		render(
			<TerminalTakeoverModeButton
				availability={availability({ mode: 'interactive_continuation' })}
				icon={<span />}
				label="Continue"
				description="provider CLI"
				pending={false}
				onSelect={onSelect}
			/>
		)
		screen.getByRole('button').click()
		expect(onSelect).toHaveBeenCalledWith('interactive_continuation')
	})
})
