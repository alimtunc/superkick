import { useCallback, useEffect, useState } from 'react'

import { DoneFooter } from '@/components/issues/DoneFooter'
import { IssueGroupHeader } from '@/components/issues/IssueGroupHeader'
import { IssueRow } from '@/components/issues/IssueRow'
import { IssuesEmptyState } from '@/components/issues/IssuesEmptyState'
import type { IssueGroup, IssueViewTab, LifecycleBucket } from '@/types'
import { CheckCircle2 } from 'lucide-react'

interface IssuesListViewProps {
	tab: IssueViewTab
	groups: IssueGroup[]
	bucketByIdentifier: Map<string, LifecycleBucket>
	doneCountThisWeek: number
	showDone: boolean
	onToggleDone: () => void
	focusedIdentifier: string | null
	now?: Date
}

const COLLAPSED_KEY = (tab: IssueViewTab) => `superkick.issues.collapsed.${tab}`

export function IssuesListView({
	tab,
	groups,
	bucketByIdentifier,
	doneCountThisWeek,
	showDone,
	onToggleDone,
	focusedIdentifier,
	now
}: IssuesListViewProps) {
	const collapsed = useCollapsedBuckets(tab)
	const isShipped = tab === 'shipped'

	if (groups.length === 0) {
		return (
			<section className="flex flex-1 flex-col">
				<IssuesEmptyState
					icon={CheckCircle2}
					title={emptyTitle(tab)}
					description={emptyDescription(tab)}
				/>
				{isShipped ? null : (
					<DoneFooter count={doneCountThisWeek} revealed={showDone} onToggle={onToggleDone} />
				)}
			</section>
		)
	}

	return (
		<section className="flex flex-1 flex-col">
			<div className="flex-1 overflow-y-auto">
				{groups.map((group) => (
					<div key={group.key}>
						<IssueGroupHeader
							label={group.label}
							count={group.issues.length}
							bucket={group.bucket}
							collapsed={collapsed.has(group.key)}
							onToggle={() => collapsed.toggle(group.key)}
						/>
						{collapsed.has(group.key)
							? null
							: group.issues.map((wrapper) => {
									const bucket = bucketByIdentifier.get(wrapper.issue.identifier) ?? 'open'
									return (
										<IssueRow
											key={wrapper.issue.id}
											wrapper={wrapper}
											bucket={bucket}
											focused={wrapper.issue.identifier === focusedIdentifier}
											now={now}
										/>
									)
								})}
					</div>
				))}
			</div>
			{isShipped ? null : (
				<DoneFooter count={doneCountThisWeek} revealed={showDone} onToggle={onToggleDone} />
			)}
		</section>
	)
}

interface CollapsedBuckets {
	has: (key: string) => boolean
	toggle: (key: string) => void
}

function useCollapsedBuckets(tab: IssueViewTab): CollapsedBuckets {
	const [collapsed, setCollapsed] = useState<Set<string>>(() => readCollapsed(tab))

	useEffect(() => {
		setCollapsed(readCollapsed(tab))
	}, [tab])

	const toggle = useCallback(
		(key: string) => {
			setCollapsed((prev) => {
				const next = new Set(prev)
				if (next.has(key)) next.delete(key)
				else next.add(key)
				writeCollapsed(tab, next)
				return next
			})
		},
		[tab]
	)

	const has = useCallback((key: string) => collapsed.has(key), [collapsed])

	return { has, toggle }
}

function emptyTitle(tab: IssueViewTab): string {
	switch (tab) {
		case 'mine':
			return 'Nothing assigned to you.'
		case 'shipped':
			return 'No recent ships.'
		default:
			return 'No open issues match.'
	}
}

function emptyDescription(tab: IssueViewTab): string {
	switch (tab) {
		case 'mine':
			return "You're clear. Browse All open to grab something, or create an issue."
		case 'shipped':
			return 'Issues completed in the last 7 days will show up here.'
		default:
			return 'Adjust filters or try another tab.'
	}
}

function readCollapsed(tab: IssueViewTab): Set<string> {
	if (typeof window === 'undefined') return new Set()
	try {
		const raw = window.localStorage.getItem(COLLAPSED_KEY(tab))
		if (!raw) return new Set()
		const parsed = JSON.parse(raw) as unknown
		return Array.isArray(parsed)
			? new Set(parsed.filter((v): v is string => typeof v === 'string'))
			: new Set()
	} catch {
		return new Set()
	}
}

function writeCollapsed(tab: IssueViewTab, value: Set<string>) {
	if (typeof window === 'undefined') return
	try {
		window.localStorage.setItem(COLLAPSED_KEY(tab), JSON.stringify([...value]))
	} catch {
		// localStorage may be unavailable (private mode); collapse state is best-effort.
	}
}
