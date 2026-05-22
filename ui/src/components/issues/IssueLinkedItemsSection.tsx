import { ContextSection } from '@/components/issues/ContextSection'
import { Pill } from '@/components/ui/pill'
import { useIssueWorkspaceContext } from '@/hooks/useIssueWorkspaceContext'
import { fmtRelativeTime } from '@/lib/domain'
import { linkedItemHref } from '@/lib/issueContext/linkedItemHref'
import type { IssueLinkedItemKind, IssueLinkedItemRef } from '@/types'
import { Link } from '@tanstack/react-router'
import { Link2 } from 'lucide-react'

const KIND_LABEL: Record<IssueLinkedItemKind, string> = {
	launch_task: 'Launch task',
	run: 'Run',
	conversation: 'Chat'
}

const LINK_CLASS =
	'block rounded-md px-2 py-1 transition-colors hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none'

interface IssueLinkedItemsSectionProps {
	issueId: string
	omitWhenEmpty?: boolean
}

export function IssueLinkedItemsSection({ issueId, omitWhenEmpty }: IssueLinkedItemsSectionProps) {
	const { data, isLoading, isError, error, refetch } = useIssueWorkspaceContext(issueId)
	const items = data?.linked_items ?? []

	return (
		<ContextSection
			ariaLabel="Linked items"
			heading="Linked items"
			isLoading={isLoading}
			error={isError ? (error ?? new Error('Failed to load linked items.')) : null}
			errorTitle="Linked items unavailable"
			errorFallback="Failed to load linked items."
			onRetry={() => {
				refetch()
			}}
			isEmpty={items.length === 0}
			emptyIcon={Link2}
			emptyTitle="No linked items"
			emptyDescription="Runs, launch tasks, and chats started from this issue will appear here once dispatched."
			omitWhenEmpty={omitWhenEmpty}
		>
			<ul className="space-y-1.5">
				{items.map((item) => (
					<LinkedItemRow key={`${item.kind}:${item.id}`} item={item} />
				))}
			</ul>
		</ContextSection>
	)
}

function LinkedItemRow({ item }: { item: IssueLinkedItemRef }) {
	const href = linkedItemHref(item)
	// Frozen-by-design: the context aggregate only persists `{ kind, id,
	// captured_at }`, so we render the short id rather than join against the
	// live run / launch-task state (which would defeat the snapshot semantics
	// and add per-row queries).
	const shortId = item.id.length > 8 ? `${item.id.slice(0, 8)}…` : item.id
	const label = (
		<span className="flex flex-wrap items-center gap-2 text-[12.5px]">
			<Pill tone="neutral" size="xs">
				{KIND_LABEL[item.kind]}
			</Pill>
			<span className="font-data truncate text-[12px] text-fg">{shortId}</span>
			<span className="font-data ml-auto text-[11px] text-fg-dim">
				{fmtRelativeTime(item.captured_at)}
			</span>
		</span>
	)

	if (href === null) {
		return <li className="px-2 py-1">{label}</li>
	}
	if (href.to === '/runs/$runId') {
		return (
			<li>
				<Link to="/runs/$runId" params={href.params} className={LINK_CLASS}>
					{label}
				</Link>
			</li>
		)
	}
	return (
		<li>
			<Link to="/tasks/$taskId" params={href.params} className={LINK_CLASS}>
				{label}
			</Link>
		</li>
	)
}
