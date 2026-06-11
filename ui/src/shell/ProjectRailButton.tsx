import { projectInitials } from '@/lib/desktopProjects'
import { cn } from '@/lib/utils'
import type { DesktopProject } from '@/types'

interface ProjectRailButtonProps {
	project: DesktopProject
	active: boolean
	switching: boolean
	compact: boolean
	onSelect: (project: DesktopProject) => void
}

function AttentionBadge({ count, className }: { count: number; className?: string }) {
	if (count <= 0) return null
	return (
		<span
			className={cn(
				'grid h-4 min-w-4 place-items-center rounded-full bg-danger px-0.5 text-[9px] text-white',
				className
			)}
		>
			{count > 9 ? '9+' : String(count)}
		</span>
	)
}

export function ProjectRailButton({ project, active, switching, compact, onSelect }: ProjectRailButtonProps) {
	const title = `${project.name} — ${project.path}`

	if (compact) {
		return (
			<div className="relative flex-none">
				<button
					type="button"
					title={title}
					onClick={() => onSelect(project)}
					aria-busy={switching}
					className={cn(
						'grid size-8 cursor-pointer place-items-center rounded-lg text-[12px] font-medium transition-[background,color,box-shadow,transform] duration-100 ease-out hover:scale-[1.03] active:scale-[0.98]',
						active
							? 'bg-raised text-fg shadow-sm ring-1 ring-border'
							: 'text-fg-muted hover:bg-raised hover:text-fg hover:ring-1 hover:ring-border',
						switching ? 'ring-1 ring-accent/60' : null
					)}
				>
					{projectInitials(project.name)}
				</button>
				<AttentionBadge count={project.attention_count} className="absolute -top-1 -right-1" />
			</div>
		)
	}

	return (
		<button
			type="button"
			title={title}
			onClick={() => onSelect(project)}
			aria-busy={switching}
			className={cn(
				'flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left transition-[background,color,box-shadow,transform] duration-100 ease-out hover:translate-x-0.5',
				active
					? 'bg-raised text-fg shadow-sm ring-1 ring-border'
					: 'text-fg-muted hover:bg-raised hover:text-fg hover:ring-1 hover:ring-border',
				switching ? 'ring-1 ring-accent/60' : null
			)}
		>
			<span
				className={cn(
					'grid size-6 flex-none place-items-center rounded-md bg-canvas text-[10px] font-medium ring-1 ring-border transition-colors',
					switching ? 'text-accent ring-accent/60' : null
				)}
			>
				{projectInitials(project.name)}
			</span>
			<span className="flex-1 truncate text-[12.5px]">{project.name}</span>
			<AttentionBadge count={project.attention_count} className="flex-none" />
		</button>
	)
}
