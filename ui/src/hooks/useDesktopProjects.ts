import { isDesktopShell, selectDesktopProject } from '@/lib/desktop'
import {
	activeDesktopProject,
	addAndSelectProject,
	currentReturnPath,
	desktopProjectsQuery,
	sortDesktopProjects,
	withProjectSwitchOverlay
} from '@/lib/desktopProjects'
import { errorMessageOr } from '@/lib/errors'
import { useProjectSwitchStore } from '@/stores/projectSwitch'
import type { DesktopProject } from '@/types'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'

async function addProject() {
	try {
		await addAndSelectProject()
	} catch (error) {
		toast.error(errorMessageOr(error, 'Adding the project failed'))
	}
}

export function useDesktopProjects() {
	const { data } = useQuery({ ...desktopProjectsQuery(), enabled: isDesktopShell() })
	const projects = sortDesktopProjects(data?.projects ?? [])
	const activeId = data?.active_id ?? null
	const switchingProjectId = useProjectSwitchStore((s) => s.targetProjectId)
	const displayActiveId = switchingProjectId ?? activeId
	const activeProject =
		projects.find((project) => project.id === displayActiveId) ?? activeDesktopProject(data)

	// The shell reboots the server and navigates the webview; the overlay covers the gap.
	const switchTo = async (project: DesktopProject) => {
		if (project.id === activeId) return
		await withProjectSwitchOverlay(
			`Switching to ${project.name}…`,
			() => selectDesktopProject(project.id, currentReturnPath()),
			'Project switch failed',
			project.id
		)
	}

	return { projects, displayActiveId, activeProject, switchingProjectId, switchTo, addProject }
}
