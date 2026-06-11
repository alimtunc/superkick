import { useProjectSwitchStore } from '@/stores/projectSwitch'
import { afterEach, describe, expect, it } from 'vitest'

afterEach(() => {
	useProjectSwitchStore.setState({ message: null, targetProjectId: null })
})

describe('project switch store', () => {
	it('tracks the project selected before the desktop shell finishes switching', () => {
		useProjectSwitchStore.getState().begin('Switching to Beta...', 'project-beta')

		expect(useProjectSwitchStore.getState().message).toBe('Switching to Beta...')
		expect(useProjectSwitchStore.getState().targetProjectId).toBe('project-beta')
	})

	it('clears pending project state after a failed switch', () => {
		useProjectSwitchStore.getState().begin('Switching to Beta...', 'project-beta')
		useProjectSwitchStore.getState().clear()

		expect(useProjectSwitchStore.getState().message).toBeNull()
		expect(useProjectSwitchStore.getState().targetProjectId).toBeNull()
	})
})
