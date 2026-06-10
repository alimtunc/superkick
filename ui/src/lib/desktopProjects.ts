import {
	addDesktopProject,
	listDesktopProjects,
	pickProjectFolder,
	selectDesktopProject
} from '@/lib/desktop'
import { errorMessageOr } from '@/lib/errors'
import { queryKeys } from '@/lib/queryKeys'
import { useProjectSwitchStore } from '@/stores/projectSwitch'
import type { DesktopProject, DesktopRegistrySnapshot } from '@/types'
import { queryOptions } from '@tanstack/react-query'
import { toast } from 'sonner'

export const desktopProjectsQuery = () =>
	queryOptions({
		queryKey: queryKeys.desktopProjects.all,
		queryFn: listDesktopProjects,
		staleTime: 10_000
	})

export async function addAndSelectProject(): Promise<void> {
	const path = await pickProjectFolder()
	if (!path) return
	const project = await addDesktopProject(path)
	await selectDesktopProject(project.id)
}

export function activeDesktopProject(snapshot: DesktopRegistrySnapshot | undefined): DesktopProject | null {
	if (!snapshot?.active_id) return null
	return snapshot.projects.find((project) => project.id === snapshot.active_id) ?? null
}

export function activeDesktopProjectName(snapshot: DesktopRegistrySnapshot | undefined): string | null {
	return activeDesktopProject(snapshot)?.name ?? null
}

export function currentReturnPath(): string {
	return window.location.pathname + window.location.search
}

export function projectInitials(name: string): string {
	const words = name.trim().split(/\s+/).filter(Boolean)
	if (words.length === 0) return '?'
	if (words.length === 1) return words[0].charAt(0).toUpperCase()
	return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase()
}

/** Shows the switch overlay while `action` runs; clears it and toasts on failure. */
export async function withProjectSwitchOverlay(
	message: string,
	action: () => Promise<void>,
	errorLabel: string
): Promise<boolean> {
	useProjectSwitchStore.getState().begin(message)
	try {
		await action()
		return true
	} catch (error) {
		useProjectSwitchStore.getState().clear()
		toast.error(errorMessageOr(error, errorLabel))
		return false
	}
}
