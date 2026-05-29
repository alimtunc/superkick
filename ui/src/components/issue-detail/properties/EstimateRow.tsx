import { useState } from 'react'

import { PROPERTY_ROW_TRIGGER, PropertyRow } from '@/components/issue-detail/properties/PropertyRow'
import { EstimateInput } from '@/components/issues/pickers/EstimateInput'
import { useUpdateIssue } from '@/hooks/useUpdateIssue'
import type { IssueDetailResponse } from '@/types'
import { Popover } from '@base-ui/react/popover'

interface EstimateRowProps {
	issue: IssueDetailResponse
}

export function EstimateRow({ issue }: EstimateRowProps) {
	const [open, setOpen] = useState(false)
	const mutation = useUpdateIssue(issue.id)

	const onApply = (next: number | null) => {
		setOpen(false)
		if (next === issue.estimate) return
		mutation.mutate({
			patch: { estimate: next },
			optimistic: (previous) => ({
				...previous,
				estimate: next
			})
		})
	}

	return (
		<PropertyRow label="Estimate">
			<Popover.Root open={open} onOpenChange={setOpen}>
				<Popover.Trigger className={PROPERTY_ROW_TRIGGER} aria-label="Change estimate">
					{issue.estimate !== null ? (
						<span className="mono">{issue.estimate} pts</span>
					) : (
						<span className="prop__empty">Add estimate…</span>
					)}
				</Popover.Trigger>
				<EstimateInput current={issue.estimate} onApply={onApply} />
			</Popover.Root>
		</PropertyRow>
	)
}
