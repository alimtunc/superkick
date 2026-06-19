import type { ReactNode } from 'react'

import { Btn, Pill } from '@/components/primitives'
import { InboxRow } from '@/domains/inbox/components/InboxRow'
import { pendingLabel, pickPrimaryAction } from '@/lib/inbox/actions'
import type { LaunchQueueItem } from '@/types'
import { Link } from '@tanstack/react-router'

interface ReadyToLaunchRowProps {
	item: Extract<LaunchQueueItem, { kind: 'issue' }>
	dispatchPosition: number
	onDispatch: (issueIdentifier: string, issueId?: string) => void
	dispatchPending: boolean
}

function issueLinkWrap(issueId: string, issueIdentifier: string) {
	return (inner: ReactNode) => (
		<Link
			to="/issues/$issueId"
			params={{ issueId }}
			className="flex min-w-0 flex-1 items-start"
			aria-label={`View ${issueIdentifier}`}
		>
			{inner}
		</Link>
	)
}

export function ReadyToLaunchRow({
	item,
	dispatchPosition,
	onDispatch,
	dispatchPending
}: ReadyToLaunchRowProps) {
	const action = pickPrimaryAction({ kind: 'ready-to-launch', issue: item.issue })
	const priorityLabel = item.issue.priority.label

	return (
		<InboxRow
			tone="info"
			title={item.issue.title}
			sub={
				<Pill tone="neutral" size="sm" mono>
					#{dispatchPosition}
				</Pill>
			}
			why={item.reason || null}
			ctx={`${item.issue.identifier}${priorityLabel ? ` · ${priorityLabel}` : ''}`}
			wrap={issueLinkWrap(item.issue.id, item.issue.identifier)}
			actions={
				<Btn
					kind="primary"
					size="sm"
					icon="zap"
					disabled={dispatchPending}
					onClick={() => onDispatch(item.issue.identifier, item.issue.id)}
					aria-label={`${action.label} ${item.issue.identifier}`}
				>
					{dispatchPending ? `${pendingLabel(action.verb)}…` : action.label}
				</Btn>
			}
		/>
	)
}
