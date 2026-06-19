import { cn } from '@/lib/utils'

interface ProjectTagProps {
	name: string
	className?: string
}

export function ProjectTag({ name, className }: ProjectTagProps) {
	return (
		<span className={cn('row__project', className)}>
			<span className="dot" aria-hidden="true" />
			<span className="truncate">{name}</span>
		</span>
	)
}
