import { ErrorState } from '@/components/primitives'
import { InboxSection } from '@/domains/inbox/components/InboxSection'
import { InboxSectionBody } from '@/domains/inbox/components/InboxSectionBody'
import { NeedsHumanRow } from '@/domains/inbox/components/NeedsHumanRow'
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
		<InboxSection title="Needs a human" count={loading ? null : items.length}>
			<InboxSectionBody
				loading={loading}
				error={error}
				emptyMessage="Nothing waiting on you. Approvals, failed runs, and stalled work surface here first."
				isEmpty={items.length === 0}
				onRetry={refresh}
				prepend={linearBanner}
			>
				{items.map((item) => (
					<NeedsHumanRow key={item.id} item={item} />
				))}
			</InboxSectionBody>
		</InboxSection>
	)
}
