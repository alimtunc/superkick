import { IssueContextSections } from '@/components/issues/IssueContextSections'
import { cn } from '@/lib/utils'

export type IssueContextPanelVariant = 'inline' | 'rail'

interface IssueContextPanelProps {
	issueId: string
	variant: IssueContextPanelVariant
}

const INTRO_COPY =
	'Shared workspace context — what the Plan, Implement, and Review agents read on every run. Each step appends its own memory entries here.'

export function IssueContextPanel({ issueId, variant }: IssueContextPanelProps) {
	const wrapperClass =
		variant === 'rail'
			? 'flex h-full min-h-0 w-80 shrink-0 flex-col border-l border-edge bg-carbon-dim/40'
			: 'rounded-md border border-edge bg-graphite/40'

	const bodyClass = cn(
		'flex flex-col gap-4',
		variant === 'rail' ? 'min-h-0 flex-1 overflow-y-auto px-4 py-3' : 'px-4 py-3'
	)

	return (
		<aside aria-label="Workspace context" className={wrapperClass}>
			{variant === 'rail' ? (
				<header className="flex h-9 shrink-0 items-center border-b border-edge px-4">
					<h2 className="font-data text-[11px] font-medium tracking-widest text-silver uppercase">
						Context
					</h2>
				</header>
			) : null}
			<div className={bodyClass}>
				<p className="text-[12px] leading-relaxed text-fg-dim">{INTRO_COPY}</p>
				<IssueContextSections issueId={issueId} />
			</div>
		</aside>
	)
}
