import { useState } from 'react'

import { PROPERTY_ROW_TRIGGER, PropertyRow } from '@/components/issue-detail/properties/PropertyRow'
import { DueDatePicker } from '@/components/issues/pickers/DueDatePicker'
import { useUpdateIssue } from '@/hooks/useUpdateIssue'
import { formatShortDate } from '@/lib/format'
import type { IssueDetailResponse } from '@/types'
import { Popover } from '@base-ui/react/popover'

interface DueDateRowProps {
	issue: IssueDetailResponse
}

export function DueDateRow({ issue }: DueDateRowProps) {
	const [open, setOpen] = useState(false)
	const mutation = useUpdateIssue(issue.id)
	const dueLabel = issue.due_date ? formatShortDate(issue.due_date) : null

	const onApply = (next: string | null) => {
		setOpen(false)
		if (next === issue.due_date) return
		mutation.mutate({
			patch: { due_date: next },
			optimistic: (previous) => ({
				...previous,
				due_date: next
			})
		})
	}

	return (
		<PropertyRow label="Due date">
			<Popover.Root open={open} onOpenChange={setOpen}>
				<Popover.Trigger className={PROPERTY_ROW_TRIGGER} aria-label="Change due date">
					{dueLabel ? (
						<span className="text-fg">{dueLabel}</span>
					) : (
						<span className="text-fg-dim">No due date</span>
					)}
				</Popover.Trigger>
				<DueDatePicker current={issue.due_date} onApply={onApply} />
			</Popover.Root>
		</PropertyRow>
	)
}
