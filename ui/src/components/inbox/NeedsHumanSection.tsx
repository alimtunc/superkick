import { InboxSection } from '@/components/inbox/InboxSection'
import { InboxSectionBody } from '@/components/inbox/InboxSectionBody'
import { NeedsHumanRow } from '@/components/inbox/NeedsHumanRow'
import { ErrorState } from '@/components/ui/state-error'
import { useNeedsHumanItems } from '@/hooks/useNeedsHumanItems'

export function NeedsHumanSection() {
	const { items, loading, error, linearWarning, refresh } = useNeedsHumanItems()

	const linearBanner = linearWarning ? (
		<ErrorState
			message={`Linear unavailable — approval requests may be missing. ${linearWarning}`}
			density="compact"
		/>
	) : null

	return (
		<InboxSection
			title="Needs Human"
			count={loading ? null : items.length}
			tone={items.length > 0 ? 'urgent' : 'default'}
		>
			<InboxSectionBody
				loading={loading}
				error={error}
				emptyMessage="Nothing waiting on you. Approvals, failed runs, and stalled work will surface here first."
				isEmpty={items.length === 0}
				onRetry={refresh}
				prepend={linearBanner}
			>
				<div className="divide-y divide-edge/50 overflow-hidden rounded border border-oxide/40 bg-oxide/5">
					{items.map((item) => (
						<NeedsHumanRow key={item.id} item={item} />
					))}
				</div>
			</InboxSectionBody>
		</InboxSection>
	)
}
