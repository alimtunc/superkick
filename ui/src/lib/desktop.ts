import type { DesktopProject, DesktopRegistrySnapshot } from '@/types'

interface TauriCore {
	invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>
}

interface TauriGlobal {
	core: TauriCore
}

declare global {
	interface Window {
		__TAURI__?: TauriGlobal
	}
}

// The Tauri shell injects `window.__TAURI__` even into remotely-served pages; plain browsers never have it.
export function isDesktopShell(): boolean {
	return typeof window !== 'undefined' && window.__TAURI__ != null
}

function tauriCore(): TauriCore {
	const tauri = window.__TAURI__
	if (!tauri) {
		throw new Error('Tauri bridge unavailable outside the desktop shell')
	}
	return tauri.core
}

export function listDesktopProjects(): Promise<DesktopRegistrySnapshot> {
	return tauriCore().invoke('list_projects')
}

export function selectDesktopProject(id: string, returnPath?: string): Promise<void> {
	return tauriCore().invoke('select_project', { id, returnPath })
}

export function addDesktopProject(path: string): Promise<DesktopProject> {
	return tauriCore().invoke('add_project', { path })
}

export function reportDesktopAttention(projectId: string, count: number): Promise<void> {
	return tauriCore().invoke('report_attention', { projectId, count })
}

export function configureDesktopProject(
	id: string,
	linearApiKey: string | null,
	returnPath?: string
): Promise<void> {
	return tauriCore().invoke('configure_project', { id, linearApiKey, returnPath })
}

export function openDesktopPicker(): Promise<void> {
	return tauriCore().invoke('show_picker')
}

export function pickProjectFolder(): Promise<string | null> {
	return tauriCore().invoke('plugin:dialog|open', {
		options: { directory: true, multiple: false, title: 'Choose a git repository' }
	})
}
