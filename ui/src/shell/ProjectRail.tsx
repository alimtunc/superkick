import { useDesktopProjects } from '@/hooks/useDesktopProjects'
import { cn } from '@/lib/utils'
import { useProjectRailStore } from '@/stores/projectRail'
import { ChevronsLeft, ChevronsRight, Plus } from 'lucide-react'

import { ProjectRailButton } from './ProjectRailButton'

const COMPACT_ACTION_CLASS =
	'grid size-8 flex-none cursor-pointer place-items-center rounded-lg text-fg-muted hover:bg-raised hover:text-fg'
const WIDE_ACTION_CLASS =
	'flex w-full flex-none cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] text-fg-muted hover:bg-raised hover:text-fg'

export function ProjectRail() {
	const compact = useProjectRailStore((s) => s.compact)
	const toggleCompact = useProjectRailStore((s) => s.toggleCompact)
	const { projects, displayActiveId, switchingProjectId, switchTo, addProject } = useDesktopProjects()

	const actionClass = compact ? COMPACT_ACTION_CLASS : WIDE_ACTION_CLASS

	return (
		<nav
			aria-label="Projects"
			className={cn(
				'flex h-full flex-none flex-col gap-2 border-r border-border bg-surface py-3 transition-[width] duration-150',
				compact ? 'w-12 items-center' : 'w-48 px-2'
			)}
		>
			<div
				className={cn(
					'flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto',
					compact && 'items-center'
				)}
			>
				{projects.map((project) => (
					<ProjectRailButton
						key={project.id}
						project={project}
						active={project.id === displayActiveId}
						switching={project.id === switchingProjectId}
						compact={compact}
						onSelect={switchTo}
					/>
				))}
			</div>
			<div className={cn('h-px flex-none bg-border', compact ? 'w-6' : 'w-full')} aria-hidden="true" />
			<button type="button" title="Add project" onClick={addProject} className={actionClass}>
				<Plus size={14} strokeWidth={1.75} aria-hidden="true" />
				{compact ? null : 'Add project'}
			</button>
			<button
				type="button"
				title={compact ? 'Expand project rail' : 'Collapse project rail'}
				onClick={toggleCompact}
				className={actionClass}
			>
				{compact ? (
					<ChevronsRight size={14} strokeWidth={1.75} aria-hidden="true" />
				) : (
					<ChevronsLeft size={14} strokeWidth={1.75} aria-hidden="true" />
				)}
				{compact ? null : 'Collapse'}
			</button>
		</nav>
	)
}
