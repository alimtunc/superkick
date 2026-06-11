import { MENU_ITEM_CLASS, MenuPopup } from '@/components/ui/menu-shell'
import { useDesktopProjects } from '@/hooks/useDesktopProjects'
import { openDesktopPicker } from '@/lib/desktop'
import { errorMessageOr } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { Menu } from '@base-ui/react/menu'
import { Check, ChevronDown, FolderGit2, FolderPlus, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'

const onManage = async () => {
	try {
		await openDesktopPicker()
	} catch (error) {
		toast.error(errorMessageOr(error, 'Opening the project picker failed'))
	}
}

export function ProjectSwitcher() {
	const { projects, displayActiveId, switchingProjectId, activeProject, switchTo, addProject } =
		useDesktopProjects()

	return (
		<Menu.Root>
			<Menu.Trigger className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-1.5 py-1 text-left transition-[background,color] duration-100 outline-none hover:bg-raised data-[popup-open]:bg-raised">
				<span className="truncate text-[13px] font-semibold text-fg">
					{activeProject?.name ?? 'Choose project'}
				</span>
				<ChevronDown
					size={13}
					strokeWidth={1.75}
					aria-hidden="true"
					className="shrink-0 text-fg-dim"
				/>
			</Menu.Trigger>
			<MenuPopup align="start" popupClassName="min-w-56">
				{projects.map((project) => (
					<Menu.Item
						key={project.id}
						onClick={() => switchTo(project)}
						className={cn(MENU_ITEM_CLASS, 'justify-between')}
						aria-busy={project.id === switchingProjectId}
					>
						<span className="flex min-w-0 items-center gap-2">
							<FolderGit2
								size={13}
								strokeWidth={1.75}
								aria-hidden="true"
								className={cn(
									'shrink-0 text-fg-dim transition-colors',
									project.id === displayActiveId ? 'text-accent' : null
								)}
							/>
							<span className="truncate">{project.name}</span>
						</span>
						{project.id === displayActiveId ? (
							<Check
								size={12}
								strokeWidth={2}
								aria-hidden="true"
								className="shrink-0 text-accent"
							/>
						) : null}
					</Menu.Item>
				))}
				{projects.length > 0 ? <div className="h-px bg-border" /> : null}
				<Menu.Item onClick={addProject} className={MENU_ITEM_CLASS}>
					<FolderPlus size={13} strokeWidth={1.75} aria-hidden="true" className="text-fg-dim" />
					Add project…
				</Menu.Item>
				<Menu.Item onClick={onManage} className={MENU_ITEM_CLASS}>
					<SlidersHorizontal
						size={13}
						strokeWidth={1.75}
						aria-hidden="true"
						className="text-fg-dim"
					/>
					Manage projects…
				</Menu.Item>
			</MenuPopup>
		</Menu.Root>
	)
}
