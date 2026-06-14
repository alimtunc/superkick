import type {
	LaunchProfilePatch,
	LaunchProfileSettings,
	RunnerConfigResponse,
	RunnerConfigUpdate,
	ServerConfigResponse
} from '@/types'

import { getJson, patchJson, putJson } from './_shared'

export async function fetchConfig(): Promise<ServerConfigResponse> {
	return getJson(`/config`, 'fetch failed: GET /config')
}

export async function fetchRunnerConfig(): Promise<RunnerConfigResponse> {
	return getJson(`/config/runner`, 'fetch failed: GET /config/runner')
}

export async function updateRunnerConfig(update: RunnerConfigUpdate): Promise<RunnerConfigResponse> {
	return putJson(`/config/runner`, 'update runner config failed', update)
}

export async function updateLaunchProfileSettings(patch: LaunchProfilePatch): Promise<LaunchProfileSettings> {
	return patchJson(`/config/launch-profile`, 'update launch profile failed', patch)
}
