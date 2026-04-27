import { InboxSection } from '@/components/inbox/InboxSection'
import { InboxSectionBody } from '@/components/inbox/InboxSectionBody'
import { RecentlyDoneRow } from '@/components/inbox/RecentlyDoneRow'
import { useRecentlyDoneEntries } from '@/hooks/useRecentlyDoneEntries'

export function RecentlyDoneSection() {
	const { entries, loading, error, refTime } = useRecentlyDoneEntries()
	const errorMessage = error
		? `Linear unavailable — ${error}. Recent activity hidden until reconnected.`
		: null

	return (
		<InboxSection title="Recently Done" count={loading ? null : entries.length}>
			<InboxSectionBody
				loading={loading}
				error={errorMessage}
				emptyMessage="Nothing shipped in the last 24h. Completed runs and merged issues will surface here briefly before fading."
				isEmpty={entries.length === 0}
			>
				<div className="divide-y divide-edge/50 overflow-hidden rounded border border-edge">
					{entries.map((entry) => (
						<RecentlyDoneRow key={entry.id} entry={entry} refTime={refTime} />
					))}
				</div>
			</InboxSectionBody>
		</InboxSection>
	)
}
