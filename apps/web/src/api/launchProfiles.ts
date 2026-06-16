import type { LaunchProfile, PreviewProfileRequest, ProfileSnapshot } from '@/types'

import { deleteVoid, getJson, patchJson, postJson } from './_shared'

export async function fetchLaunchProfiles(): Promise<LaunchProfile[]> {
	return getJson('/launch-profiles', 'fetch launch profiles failed')
}

export async function fetchLaunchProfile(id: string): Promise<LaunchProfile> {
	return getJson(`/launch-profiles/${id}`, 'fetch launch profile failed')
}

export async function createLaunchProfile(profile: LaunchProfile): Promise<LaunchProfile> {
	return postJson('/launch-profiles', 'create launch profile failed', profile)
}

export async function updateLaunchProfile(id: string, profile: LaunchProfile): Promise<LaunchProfile> {
	return patchJson(`/launch-profiles/${id}`, 'update launch profile failed', profile)
}

export async function deleteLaunchProfile(id: string): Promise<void> {
	return deleteVoid(`/launch-profiles/${id}`, 'delete launch profile failed')
}

export async function previewLaunchProfile(req: PreviewProfileRequest): Promise<ProfileSnapshot> {
	return postJson('/launch-profiles/preview', 'preview launch profile failed', req)
}
