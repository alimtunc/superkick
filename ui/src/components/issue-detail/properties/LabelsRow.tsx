import { useMemo, useState } from 'react'

import { LabelChip } from '@/components/issue-detail/LabelChip'
import { PROPERTY_ROW_TRIGGER, PropertyRow } from '@/components/issue-detail/properties/PropertyRow'
import { LabelsPicker } from '@/components/issues/pickers/LabelsPicker'
import { useLinearOptions } from '@/hooks/useLinearOptions'
import { useUpdateIssue } from '@/hooks/useUpdateIssue'
import type { IssueDetailResponse, LabelOption } from '@/types'
import { Popover } from '@base-ui/react/popover'

interface LabelsRowProps {
	issue: IssueDetailResponse
}

export function LabelsRow({ issue }: LabelsRowProps) {
	const [open, setOpen] = useState(false)
	const { data: options } = useLinearOptions()
	const mutation = useUpdateIssue(issue.id)

	const visibleLabels: LabelOption[] = useMemo(() => {
		if (!options) return []
		return options.labels.filter((label) => label.team_id === null || label.team_id === issue.team_id)
	}, [options, issue.team_id])

	const selectedIds = useMemo(() => {
		return issue.labels
			.map((label) => visibleLabels.find((option) => option.name === label.name)?.id)
			.filter((id): id is string => id !== undefined)
	}, [issue.labels, visibleLabels])

	const onApply = (nextIds: string[]) => {
		setOpen(false)
		const before = selectedIds.toSorted()
		const after = nextIds.toSorted()
		if (before.length === after.length && before.every((id, i) => id === after[i])) return
		const byId = new Map(visibleLabels.map((label) => [label.id, label]))
		mutation.mutate({
			patch: { label_ids: nextIds },
			optimistic: (previous) => ({
				...previous,
				labels: nextIds
					.map((id) => byId.get(id))
					.filter((option): option is LabelOption => option !== undefined)
					.map((option) => ({ name: option.name, color: option.color }))
			})
		})
	}

	return (
		<PropertyRow label="Labels">
			<Popover.Root open={open} onOpenChange={setOpen}>
				<Popover.Trigger className={PROPERTY_ROW_TRIGGER} aria-label="Change labels">
					{issue.labels.length > 0 ? (
						<span className="flex flex-wrap gap-1">
							{issue.labels.map((label) => (
								<LabelChip key={label.name} label={label} />
							))}
						</span>
					) : (
						<span className="prop__empty">Add label…</span>
					)}
				</Popover.Trigger>
				<LabelsPicker labels={visibleLabels} selectedIds={selectedIds} onApply={onApply} />
			</Popover.Root>
		</PropertyRow>
	)
}
