import { useState } from 'react'

import { PROPERTY_ROW_TRIGGER, PropertyRow } from '@/components/issue-detail/properties/PropertyRow'
import { EstimateInput } from '@/components/issues/pickers/EstimateInput'
import { useUpdateIssue } from '@/hooks/useUpdateIssue'
import type { IssueDetailResponse } from '@/types'
import { EstimateChip } from '@/ui'
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
						<>
							<EstimateChip n={issue.estimate} />
							<span className="text-[11.5px] text-fg-dim">points</span>
						</>
					) : (
						<span className="text-fg-dim">No estimate</span>
					)}
				</Popover.Trigger>
				<EstimateInput current={issue.estimate} onApply={onApply} />
			</Popover.Root>
		</PropertyRow>
	)
}
