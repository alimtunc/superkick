import { InboxSectionBody } from '@/components/inbox/InboxSectionBody'
import { RecentlyDoneRow } from '@/components/inbox/RecentlyDoneRow'
import { useRecentlyDoneEntries } from '@/hooks/useRecentlyDoneEntries'

export function RecentlyDoneSection() {
	const { entries, loading, error, refTime } = useRecentlyDoneEntries()
	const errorMessage = error
		? `Linear unavailable — ${error}. Recent activity hidden until reconnected.`
		: null

	return (
		<InboxSectionBody
			loading={loading}
			error={errorMessage}
			emptyMessage="Nothing shipped in the last 24h."
			isEmpty={entries.length === 0}
		>
			{entries.map((entry) => (
				<RecentlyDoneRow key={entry.id} entry={entry} refTime={refTime} />
			))}
		</InboxSectionBody>
	)
}
