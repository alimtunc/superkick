import { useState } from 'react'

import { StatusIcon } from '@/components/primitives'
import {
	PROPERTY_ROW_TRIGGER,
	PropertyRow
} from '@/domains/issues/components/issue-detail/properties/PropertyRow'
import { StatusPicker } from '@/domains/issues/components/pickers/StatusPicker'
import { useLinearOptions } from '@/hooks/useLinearOptions'
import { useUpdateIssue } from '@/hooks/useUpdateIssue'
import { statusIconKindFor } from '@/lib/domain'
import type { IssueDetailResponse, WorkflowStateOption } from '@/types'
import { Popover } from '@base-ui/react/popover'

interface StatusRowProps {
	issue: IssueDetailResponse
}

export function StatusRow({ issue }: StatusRowProps) {
	const [open, setOpen] = useState(false)
	const { data: options } = useLinearOptions()
	const mutation = useUpdateIssue(issue.id)

	const states: WorkflowStateOption[] =
		issue.team_id && options ? (options.workflow_states_by_team[issue.team_id] ?? []) : []
	const currentId = states.find((state) => state.name === issue.status.name)?.id ?? null

	const onSelect = (next: WorkflowStateOption) => {
		setOpen(false)
		if (next.id === currentId) return
		mutation.mutate({
			patch: { state_id: next.id },
			optimistic: (previous) => ({
				...previous,
				status: {
					state_type: next.state_type,
					name: next.name,
					color: next.color
				}
			})
		})
	}

	return (
		<PropertyRow label="Status">
			<Popover.Root open={open} onOpenChange={setOpen}>
				<Popover.Trigger className={PROPERTY_ROW_TRIGGER} aria-label="Change status">
					<StatusIcon kind={statusIconKindFor(issue.status)} size={14} color={issue.status.color} />
					<span>{issue.status.name}</span>
				</Popover.Trigger>
				<StatusPicker states={states} currentId={currentId} onSelect={onSelect} />
			</Popover.Root>
		</PropertyRow>
	)
}
