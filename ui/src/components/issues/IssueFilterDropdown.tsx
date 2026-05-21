import { useState, type ReactNode } from 'react'

import { PopoverPopup } from '@/components/ui/popover-shell'
import { cn } from '@/lib/utils'
import type { IssueFilterState, IssueLabel, IssuePriority } from '@/types'
import { Icon, PriorityIcon } from '@/ui'
import { Popover } from '@base-ui/react/popover'

type AxisKey = 'assignee' | 'status' | 'priority' | 'label' | 'project'

interface IssueFilterDropdownProps {
	filters: IssueFilterState
	onChange: (next: IssueFilterState) => void
	options: FilterOptionSet
	trigger: ReactNode
	open?: boolean
	onOpenChange?: (open: boolean) => void
}

export interface FilterOptionSet {
	assignees: { id: string; name: string }[]
	statuses: { state_type: string; name: string }[]
	priorities: IssuePriority[]
	labels: IssueLabel[]
	projects: string[]
}

const AXES: { key: AxisKey; label: string }[] = [
	{ key: 'assignee', label: 'Assignee' },
	{ key: 'status', label: 'Status' },
	{ key: 'priority', label: 'Priority' },
	{ key: 'label', label: 'Label' },
	{ key: 'project', label: 'Project' }
]

export function IssueFilterDropdown({
	filters,
	onChange,
	options,
	trigger,
	open,
	onOpenChange
}: IssueFilterDropdownProps) {
	const [activeAxis, setActiveAxis] = useState<AxisKey | null>(null)

	return (
		<Popover.Root open={open} onOpenChange={onOpenChange}>
			<Popover.Trigger render={<>{trigger}</>} />
			<PopoverPopup
				align="start"
				sideOffset={6}
				popupClassName="w-60 border border-border bg-overlay shadow-xl"
			>
				{activeAxis === null ? (
					<ul className="py-1">
						{AXES.map((axis) => (
							<li key={axis.key}>
								<button
									type="button"
									onClick={() => setActiveAxis(axis.key)}
									className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[12px] text-fg hover:bg-raised focus-visible:bg-raised focus-visible:outline-none"
								>
									<span>{axis.label}</span>
									<Icon name="chev" size={12} className="text-fg-dim" />
								</button>
							</li>
						))}
					</ul>
				) : (
					<AxisPicker
						axis={activeAxis}
						filters={filters}
						onChange={onChange}
						options={options}
						onBack={() => setActiveAxis(null)}
					/>
				)}
			</PopoverPopup>
		</Popover.Root>
	)
}

function AxisPicker({
	axis,
	filters,
	onChange,
	options,
	onBack
}: {
	axis: AxisKey
	filters: IssueFilterState
	onChange: (next: IssueFilterState) => void
	options: FilterOptionSet
	onBack: () => void
}) {
	const items = pickerItems(axis, options)

	function toggle(value: string | number) {
		onChange(toggleFilterValue(filters, axis, value))
	}

	return (
		<div className="flex flex-col">
			<button
				type="button"
				onClick={onBack}
				className="flex h-8 items-center gap-1 border-b border-border px-3 text-[11px] font-medium text-fg-dim hover:bg-raised focus-visible:bg-raised focus-visible:outline-none"
			>
				<Icon name="chev" size={11} className="rotate-180" />
				<span>{axisLabel(axis)}</span>
			</button>
			<ul className="max-h-72 overflow-y-auto py-1">
				{items.map((item) => {
					const selected = isSelected(filters, axis, item.value)
					return (
						<li key={String(item.value)}>
							<button
								type="button"
								onClick={() => toggle(item.value)}
								className={cn(
									'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-raised focus-visible:bg-raised focus-visible:outline-none',
									selected ? 'text-fg' : 'text-fg-muted'
								)}
							>
								<span
									className={cn(
										'inline-flex size-3.5 shrink-0 items-center justify-center rounded border border-border',
										selected ? 'bg-accent text-canvas' : 'bg-transparent'
									)}
								>
									{selected ? <Icon name="check" size={10} /> : null}
								</span>
								{item.leading}
								<span className="truncate">{item.label}</span>
							</button>
						</li>
					)
				})}
			</ul>
		</div>
	)
}

function pickerItems(
	axis: AxisKey,
	options: FilterOptionSet
): { value: string | number; label: string; leading?: ReactNode }[] {
	switch (axis) {
		case 'assignee':
			return options.assignees.map((a) => ({ value: a.id, label: a.name }))
		case 'status':
			return options.statuses.map((s) => ({ value: s.state_type, label: s.name }))
		case 'priority':
			return options.priorities.map((p) => ({
				value: p.value,
				label: p.label,
				leading: <PriorityIcon kind={priorityKind(p.value)} size={12} />
			}))
		case 'label':
			return options.labels.map((l) => ({ value: l.name, label: l.name }))
		case 'project':
			return options.projects.map((p) => ({ value: p, label: p }))
	}
}

function priorityKind(value: number): 'urgent' | 'high' | 'medium' | 'low' | 'none' {
	switch (value) {
		case 1:
			return 'urgent'
		case 2:
			return 'high'
		case 3:
			return 'medium'
		case 4:
			return 'low'
		default:
			return 'none'
	}
}

function axisLabel(axis: AxisKey): string {
	const found = AXES.find((a) => a.key === axis)
	return found ? found.label : axis
}

function isSelected(filters: IssueFilterState, axis: AxisKey, value: string | number): boolean {
	switch (axis) {
		case 'assignee':
			return filters.assignee.includes(value as string)
		case 'status':
			return filters.status.includes(value as string)
		case 'priority':
			return filters.priority.includes(value as number)
		case 'label':
			return filters.label.includes(value as string)
		case 'project':
			return filters.project.includes(value as string)
	}
}

function toggleFilterValue(
	filters: IssueFilterState,
	axis: AxisKey,
	value: string | number
): IssueFilterState {
	if (axis === 'priority') {
		const current = filters.priority
		const next = current.includes(value as number)
			? current.filter((v) => v !== value)
			: [...current, value as number]
		return { ...filters, priority: next }
	}
	const key: 'assignee' | 'status' | 'label' | 'project' = axis
	const current = filters[key]
	const next = current.includes(value as string)
		? current.filter((v) => v !== value)
		: [...current, value as string]
	return { ...filters, [key]: next }
}
