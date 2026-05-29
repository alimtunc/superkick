import { cn } from '@/lib/utils'
import { Icon } from '@/ui'

interface ProjectTagProps {
	name: string
	className?: string
}

export function ProjectTag({ name, className }: ProjectTagProps) {
	return (
		<span
			className={cn(
				'font-data inline-flex max-w-[140px] items-center gap-1 truncate text-[11.5px] text-fg-muted',
				className
			)}
		>
			<Icon name="folder" size={11} className="shrink-0 text-fg-dim" />
			<span className="truncate">{name}</span>
		</span>
	)
}
