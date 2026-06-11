import { useMemo, useState } from 'react'

import { InboxTabs } from '@/components/inbox/InboxTabs'
import { NeedsHumanSection } from '@/components/inbox/NeedsHumanSection'
import { UpdatesWorthALookSection } from '@/components/inbox/UpdatesWorthALookSection'
import { useLaunchQueue } from '@/hooks/useLaunchQueue'
import { useNeedsHumanItems } from '@/hooks/useNeedsHumanItems'
import { useOperatorQueue } from '@/hooks/useOperatorQueue'
import { useRecentlyDoneEntries } from '@/hooks/useRecentlyDoneEntries'
import { dashboardQueueQuery, launchQueueQuery, runsQuery } from '@/lib/queries'
import { usePageActions } from '@/shell/usePageActions'
import type { InboxTabId } from '@/types'
import { Btn } from '@/ui/Btn'
import { Icon } from '@/ui/Icon'
import { createRoute, useNavigate } from '@tanstack/react-router'

import { Route as shellRoute } from './route'

export const Route = createRoute({
	getParentRoute: () => shellRoute,
	path: '/',
	loader: ({ context }) => {
		void context.queryClient.prefetchQuery(runsQuery())
		void context.queryClient.prefetchQuery(dashboardQueueQuery())
		void context.queryClient.prefetchQuery(launchQueueQuery())
	},
	component: InboxPage
})

function InboxEmpty() {
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-3.5 px-6 py-16">
			<div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-soft">
				<Icon name="check" size={26} className="text-success" />
			</div>
			<div className="text-[18px] font-semibold text-fg">Inbox zero.</div>
			<div className="max-w-sm text-center text-[13px] text-fg-muted">
				Watching tab tracks runs that don&apos;t need you yet.
			</div>
			<Btn kind="secondary" size="sm" icon="layers" className="mt-1.5">
				See watching tab
			</Btn>
		</div>
	)
}

function InboxPage() {
	const navigate = useNavigate()
	const [activeTab, setActiveTab] = useState<InboxTabId>('needs')

	const needs = useNeedsHumanItems()
	const queue = useOperatorQueue()
	const launchQueue = useLaunchQueue()
	const done = useRecentlyDoneEntries()

	const watchingCount =
		(queue.groups['active']?.length ?? 0) + (launchQueue.groups['launchable']?.length ?? 0)
	const allCount = watchingCount + needs.items.length + done.entries.length

	usePageActions({
		right: useMemo(
			() => (
				<>
					<Btn kind="ghost" size="sm" icon="filter">
						Filters
					</Btn>
					<Btn kind="ghost" size="sm" icon="check">
						Mark all read
					</Btn>
					<Btn kind="primary" size="sm" icon="plus" onClick={() => navigate({ to: '/tasks/new' })}>
						Launch task
					</Btn>
				</>
			),
			[navigate]
		)
	})

	const tabs = useMemo(
		() => [
			{ id: 'needs' as const, label: 'Needs you', count: needs.items.length },
			{ id: 'watching' as const, label: 'Watching', count: watchingCount },
			{ id: 'all' as const, label: 'All activity', count: allCount }
		],
		[needs.items.length, watchingCount, allCount]
	)

	const hasItems = needs.items.length > 0 || watchingCount > 0 || done.entries.length > 0

	return (
		<div className="flex h-full min-h-0 flex-col">
			<InboxTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
			{activeTab === 'needs' ? (
				<div className="flex-1 overflow-y-auto">
					{!needs.loading && !hasItems ? (
						<InboxEmpty />
					) : (
						<>
							<NeedsHumanSection />
							<UpdatesWorthALookSection />
						</>
					)}
				</div>
			) : (
				<div className="flex flex-1 items-center justify-center px-6 py-16 text-[13px] text-fg-muted">
					Coming next — this tab will track runs you&apos;re watching without needing to act on.
				</div>
			)}
		</div>
	)
}
