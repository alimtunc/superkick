import { isDesktopShell, selectDesktopProject } from '@/lib/desktop'
import {
	activeDesktopProject,
	addAndSelectProject,
	currentReturnPath,
	desktopProjectsQuery,
	withProjectSwitchOverlay
} from '@/lib/desktopProjects'
import { errorMessageOr } from '@/lib/errors'
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
	const projects = (data?.projects ?? []).toSorted((a, b) =>
		(b.last_opened_at ?? '').localeCompare(a.last_opened_at ?? '')
	)
	const activeId = data?.active_id ?? null
	const activeProject = activeDesktopProject(data)

	// The shell reboots the server and navigates the webview; the overlay covers the gap.
	const switchTo = async (project: DesktopProject) => {
		if (project.id === activeId) return
		await withProjectSwitchOverlay(
			`Switching to ${project.name}…`,
			() => selectDesktopProject(project.id, currentReturnPath()),
			'Project switch failed'
		)
	}

	return { projects, activeId, activeProject, switchTo, addProject }
}
