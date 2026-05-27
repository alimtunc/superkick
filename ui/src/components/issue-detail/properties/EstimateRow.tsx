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
					<span className="inline-flex items-center gap-1.5">
						<span className="font-data inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-raised px-1 text-[11px] text-fg">
							{issue.estimate ?? '—'}
						</span>
						<span className="text-fg-dim">points</span>
					</span>
				</Popover.Trigger>
				<EstimateInput current={issue.estimate} onApply={onApply} />
			</Popover.Root>
		</PropertyRow>
	)
}
