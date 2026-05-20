import { IssueCommentExcerptsSection } from '@/components/issues/IssueCommentExcerptsSection'
import { IssueLinkedItemsSection } from '@/components/issues/IssueLinkedItemsSection'
import { IssueMemoryListSection } from '@/components/issues/IssueMemoryListSection'
import { IssueSnapshotSection } from '@/components/issues/IssueSnapshotSection'
import { cn } from '@/lib/utils'

export type IssueContextPanelVariant = 'inline' | 'rail'

interface IssueContextPanelProps {
	issueId: string
	variant: IssueContextPanelVariant
}

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
				<IssueSnapshotSection issueId={issueId} />
				<IssueCommentExcerptsSection issueId={issueId} />
				<IssueLinkedItemsSection issueId={issueId} />
				<IssueMemoryListSection issueId={issueId} />
			</div>
		</aside>
	)
}
