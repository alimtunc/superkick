import type { ServerConfigResponse } from '@/types'

const DEFAULT_AUTO_TRANSITION = true

export function readAutoTransitionInProgress(config: ServerConfigResponse | null): boolean {
	return config?.launch_profile.auto_transition_in_progress ?? DEFAULT_AUTO_TRANSITION
}
