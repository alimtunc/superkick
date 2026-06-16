import { useMemo } from 'react'

import { Btn, Icon } from '@/components/primitives'
import { NeedsHumanSection } from '@/domains/inbox/components/NeedsHumanSection'
import { UpdatesWorthALookSection } from '@/domains/inbox/components/UpdatesWorthALookSection'
import { useNeedsHumanItems } from '@/hooks/useNeedsHumanItems'
import { dashboardQueueQuery, launchQueueQuery, runsQuery } from '@/lib/queries'
import { usePageActions } from '@/shell/usePageActions'
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
			<div className="max-w-sm text-center text-[13px] text-fg-muted">Nothing needs you right now.</div>
		</div>
	)
}

function InboxPage() {
	const navigate = useNavigate()

	const needs = useNeedsHumanItems()

	usePageActions({
		right: useMemo(
			() => (
				<Btn kind="primary" size="sm" icon="plus" onClick={() => navigate({ to: '/tasks/new' })}>
					Launch task
				</Btn>
			),
			[navigate]
		)
	})

	const hasItems = needs.items.length > 0

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex items-center gap-1.5 border-b border-border px-6 py-3 text-[13px] font-semibold text-fg">
				<span>Needs you</span>
				<span className="rounded-full bg-raised px-1.5 font-mono text-[11px] text-fg-muted">
					{needs.items.length}
				</span>
			</div>
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
		</div>
	)
}
