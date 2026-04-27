import { NeedsHumanSection } from '@/components/inbox/NeedsHumanSection'
import { ReadyToLaunchSection } from '@/components/inbox/ReadyToLaunchSection'
import { RecentlyDoneSection } from '@/components/inbox/RecentlyDoneSection'
import { RunningNowSection } from '@/components/inbox/RunningNowSection'
import { dashboardQueueQuery, launchQueueQuery, runsQuery } from '@/lib/queries'
import { createRoute } from '@tanstack/react-router'

import { Route as shellRoute } from './route'

export const Route = createRoute({
	getParentRoute: () => shellRoute,
	path: '/',
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.ensureQueryData(runsQuery()),
			context.queryClient.ensureQueryData(dashboardQueueQuery()),
			// Linear-backed launch queue is allowed to fail: the Inbox renders
			// without it (NeedsHuman/Ready-to-Launch/Recently-Done show a
			// `linearWarning` banner instead of blanking the page).
			context.queryClient.ensureQueryData(launchQueueQuery()).catch(() => null)
		]),
	component: InboxPage
})

function InboxPage() {
	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
			<header className="flex flex-col gap-1">
				<h1 className="font-data text-[18px] tracking-[0.18em] text-fog uppercase">Inbox</h1>
				<p className="font-data text-[10px] tracking-wide text-dim">
					Triage what needs your attention before launching new work.
				</p>
			</header>

			<NeedsHumanSection />
			<RunningNowSection />
			<ReadyToLaunchSection />
			<RecentlyDoneSection />

			<div className="h-6" />
		</div>
	)
}
