import { cn } from '@/lib/utils'
import { Link } from '@tanstack/react-router'
import { Zap } from 'lucide-react'

interface ExecutionLogIdleProps {
	issueIdentifier: string
}

export function ExecutionLogIdle({ issueIdentifier }: ExecutionLogIdleProps) {
	return (
		<section
			aria-label="No execution yet"
			className="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2.5"
		>
			<Zap size={14} strokeWidth={1.85} className="text-accent" aria-hidden="true" />
			<span className="text-[13px] text-fg-muted">No execution yet on this issue.</span>
			<Link
				to="/tasks/new"
				search={{ issue: issueIdentifier }}
				className={cn(
					'font-data ml-auto inline-flex h-7 items-center gap-1 rounded-md bg-accent px-2.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none'
				)}
			>
				<Zap size={12} strokeWidth={1.9} aria-hidden="true" />
				Launch task
			</Link>
		</section>
	)
}
