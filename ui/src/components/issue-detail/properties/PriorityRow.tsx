import { useState } from 'react'

import { PROPERTY_ROW_TRIGGER, PropertyRow } from '@/components/issue-detail/properties/PropertyRow'
import { PriorityPicker } from '@/components/issues/pickers/PriorityPicker'
import { useUpdateIssue } from '@/hooks/useUpdateIssue'
import { PRIORITY_META } from '@/lib/domain/priorityMeta'
import type { IssueDetailResponse } from '@/types'
import { PriorityIcon, priorityIconKindFromValue } from '@/ui'
import { Popover } from '@base-ui/react/popover'

interface PriorityRowProps {
	issue: IssueDetailResponse
}

export function PriorityRow({ issue }: PriorityRowProps) {
	const [open, setOpen] = useState(false)
	const mutation = useUpdateIssue(issue.id)
	const meta = PRIORITY_META[issue.priority.value]
	const label = meta?.label ?? issue.priority.label

	const onSelect = (next: number) => {
		setOpen(false)
		if (next === issue.priority.value) return
		const nextMeta = PRIORITY_META[next]
		mutation.mutate({
			patch: { priority: next },
			optimistic: (previous) => ({
				...previous,
				priority: {
					value: next,
					label: nextMeta?.label ?? String(next)
				}
			})
		})
	}

	return (
		<PropertyRow label="Priority">
			<Popover.Root open={open} onOpenChange={setOpen}>
				<Popover.Trigger className={PROPERTY_ROW_TRIGGER} aria-label="Change priority">
					<PriorityIcon kind={priorityIconKindFromValue(issue.priority.value)} size={13} />
					<span>{label}</span>
				</Popover.Trigger>
				<PriorityPicker currentValue={issue.priority.value} onSelect={onSelect} />
			</Popover.Root>
		</PropertyRow>
	)
}
