import { ProjectSwitchOverlay } from '@/shell/ProjectSwitchOverlay'
import { useProjectSwitchStore } from '@/stores/projectSwitch'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

afterEach(() => {
	useProjectSwitchStore.setState({ message: null, targetProjectId: null })
})

describe('ProjectSwitchOverlay', () => {
	it('renders a lightweight switch HUD instead of a full scrim modal', () => {
		useProjectSwitchStore.getState().begin('Switching to Beta...', 'project-beta')

		render(<ProjectSwitchOverlay />)

		const status = screen.getByRole('status', { name: 'Switching to Beta...' })
		expect(status).toHaveClass('project-switch-hud')
		expect(screen.getByTestId('project-switch-shield')).not.toHaveClass('bg-(--bg-scrim)')
	})
})
