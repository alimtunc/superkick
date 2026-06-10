import { useMemo, useState } from 'react'

import { IssueFilterDropdown } from '@/components/issues/IssueFilterDropdown'
import { PopoverPopup } from '@/components/ui/popover-shell'
import { cn } from '@/lib/utils'
import type { FilterOptionSet } from '@/types'
import type { IssueFilterState, IssueGroupBy, IssueSort } from '@/types'
import { Icon } from '@/ui'
import { Popover } from '@base-ui/react/popover'

interface IssueFilterBarProps {
	filters: IssueFilterState
	sort: IssueSort
	group: IssueGroupBy
	options: FilterOptionSet
	onFiltersChange: (next: IssueFilterState) => void
	onSortChange: (next: IssueSort) => void
	onGroupChange: (next: IssueGroupBy) => void
	dropdownOpen: boolean
	onDropdownOpenChange: (open: boolean) => void
}

const SORT_ICON: Record<IssueSort, 'history' | 'flag' | 'clock'> = {
	updated: 'history',
	created: 'clock',
	priority: 'flag',
	age: 'clock'
}

const SORT_LABELS: Record<IssueSort, string> = {
	updated: 'Updated',
	created: 'Created',
	priority: 'Priority',
	age: 'Age'
}

const GROUP_LABELS: Record<IssueGroupBy, string> = {
	lifecycle: 'Lifecycle',
	status: 'Status',
	priority: 'Priority',
	project: 'Project',
	assignee: 'Assignee',
	none: 'None'
}

export function IssueFilterBar({
	filters,
	sort,
	group,
	options,
	onFiltersChange,
	onSortChange,
	onGroupChange,
	dropdownOpen,
	onDropdownOpenChange
}: IssueFilterBarProps) {
	const chips = useMemo(() => buildChips(filters, options), [filters, options])

	return (
		<div className="filterbar">
			<div className="filterbar__left">
				<IssueFilterDropdown
					filters={filters}
					onChange={onFiltersChange}
					options={options}
					open={dropdownOpen}
					onOpenChange={onDropdownOpenChange}
					trigger={
						<button type="button" className="fchip fchip--add">
							<Icon name="plus" size={13} className="ic" />
							Filter
						</button>
					}
				/>

				{chips.map((chip) => (
					<FilterChip
						key={chip.key}
						chip={chip}
						onRemove={() => onFiltersChange(removeChip(filters, chip))}
						onToggleOperator={() => onFiltersChange(toggleChipOperator(filters, chip))}
					/>
				))}
			</div>

			<div className="filterbar__right">
				<SelectControl
					label="Group"
					value={group}
					options={Object.entries(GROUP_LABELS) as [IssueGroupBy, string][]}
					onChange={onGroupChange}
				/>
				<SelectControl
					label="Sort"
					icon={SORT_ICON[sort]}
					value={sort}
					options={Object.entries(SORT_LABELS) as [IssueSort, string][]}
					onChange={onSortChange}
				/>
			</div>
		</div>
	)
}

interface ChipDescriptor {
	key: string
	name: string
	op: '=' | '≠'
	valueLabel: string
	axis:
		| 'assignee'
		| 'status'
		| 'status_not'
		| 'priority'
		| 'label'
		| 'label_not'
		| 'project'
		| 'repo'
		| 'task'
		| 'created'
		| 'updated'
		| 'completed'
		| 'has_sub_issues'
	value: string | number
}

function buildChips(filters: IssueFilterState, options: FilterOptionSet): ChipDescriptor[] {
	const chips: ChipDescriptor[] = []
	for (const id of filters.assignee) {
		const found = options.assignees.find((a) => a.id === id)
		chips.push({
			key: `assignee:${id}`,
			name: 'Assignee',
			op: '=',
			valueLabel: found?.name ?? id,
			axis: 'assignee',
			value: id
		})
	}
	for (const st of filters.status) {
		const found = options.statuses.find((s) => s.state_type === st)
		chips.push({
			key: `status:${st}`,
			name: 'Status',
			op: '=',
			valueLabel: found?.name ?? st,
			axis: 'status',
			value: st
		})
	}
	for (const st of filters.status_not) {
		const found = options.statuses.find((s) => s.state_type === st)
		chips.push({
			key: `status_not:${st}`,
			name: 'Status',
			op: '≠',
			valueLabel: found?.name ?? st,
			axis: 'status_not',
			value: st
		})
	}
	for (const p of filters.priority) {
		const found = options.priorities.find((pr) => pr.value === p)
		chips.push({
			key: `priority:${p}`,
			name: 'Priority',
			op: '=',
			valueLabel: String(found?.label ?? p),
			axis: 'priority',
			value: p
		})
	}
	for (const l of filters.label) {
		chips.push({ key: `label:${l}`, name: 'Label', op: '=', valueLabel: l, axis: 'label', value: l })
	}
	for (const l of filters.label_not) {
		chips.push({
			key: `label_not:${l}`,
			name: 'Label',
			op: '≠',
			valueLabel: l,
			axis: 'label_not',
			value: l
		})
	}
	for (const p of filters.project) {
		chips.push({
			key: `project:${p}`,
			name: 'Project',
			op: '=',
			valueLabel: p,
			axis: 'project',
			value: p
		})
	}
	for (const r of filters.repo) {
		chips.push({ key: `repo:${r}`, name: 'Repo', op: '=', valueLabel: r, axis: 'repo', value: r })
	}
	for (const t of filters.task) {
		chips.push({
			key: `task:${t}`,
			name: 'Task',
			op: '=',
			valueLabel: taskLabel(t),
			axis: 'task',
			value: t
		})
	}
	for (const c of filters.created) {
		chips.push({
			key: `created:${c}`,
			name: 'Created',
			op: '=',
			valueLabel: createdLabel(c),
			axis: 'created',
			value: c
		})
	}
	for (const u of filters.updated) {
		chips.push({
			key: `updated:${u}`,
			name: 'Updated',
			op: '=',
			valueLabel: createdLabel(u),
			axis: 'updated',
			value: u
		})
	}
	for (const c of filters.completed) {
		chips.push({
			key: `completed:${c}`,
			name: 'Completed',
			op: '=',
			valueLabel: completedLabel(c),
			axis: 'completed',
			value: c
		})
	}
	for (const v of filters.has_sub_issues) {
		chips.push({
			key: `has_sub_issues:${v}`,
			name: 'Sub-issues',
			op: '=',
			valueLabel: hasSubIssuesLabel(v),
			axis: 'has_sub_issues',
			value: v
		})
	}
	return chips
}

function hasSubIssuesLabel(value: string): string {
	if (value === 'yes') return 'Yes'
	if (value === 'no') return 'No'
	return value
}

function removeChip(filters: IssueFilterState, chip: ChipDescriptor): IssueFilterState {
	if (chip.axis === 'priority') {
		return { ...filters, priority: filters.priority.filter((v) => v !== chip.value) }
	}
	const key = chip.axis
	const current = filters[key] as string[]
	return { ...filters, [key]: current.filter((v) => v !== chip.value) }
}

function toggleChipOperator(filters: IssueFilterState, chip: ChipDescriptor): IssueFilterState {
	if (chip.axis === 'status') {
		return {
			...filters,
			status: filters.status.filter((v) => v !== chip.value),
			status_not: [...filters.status_not, chip.value as string]
		}
	}
	if (chip.axis === 'status_not') {
		return {
			...filters,
			status_not: filters.status_not.filter((v) => v !== chip.value),
			status: [...filters.status, chip.value as string]
		}
	}
	if (chip.axis === 'label') {
		return {
			...filters,
			label: filters.label.filter((v) => v !== chip.value),
			label_not: [...filters.label_not, chip.value as string]
		}
	}
	if (chip.axis === 'label_not') {
		return {
			...filters,
			label_not: filters.label_not.filter((v) => v !== chip.value),
			label: [...filters.label, chip.value as string]
		}
	}
	return filters
}

function canToggleOperator(chip: ChipDescriptor): boolean {
	return (
		chip.axis === 'status' ||
		chip.axis === 'status_not' ||
		chip.axis === 'label' ||
		chip.axis === 'label_not'
	)
}

function FilterChip({
	chip,
	onRemove,
	onToggleOperator
}: {
	chip: ChipDescriptor
	onRemove: () => void
	onToggleOperator: () => void
}) {
	const label = `${chip.name} ${chip.op} ${chip.valueLabel}`
	const negated = chip.op === '≠'
	return (
		<span className={cn('fchip', negated ? 'fchip--not' : null)}>
			<span className="k">{chip.name}</span>
			{canToggleOperator(chip) ? (
				<button
					type="button"
					onClick={onToggleOperator}
					className="mono text-fg-dim hover:text-fg focus-visible:outline-none"
					aria-label={`Toggle operator for ${label}`}
				>
					{chip.op}
				</button>
			) : (
				<span className="mono text-fg-dim">{chip.op}</span>
			)}
			<span className="v">{chip.valueLabel}</span>
			<button
				type="button"
				onClick={onRemove}
				className="x inline-flex items-center justify-center focus-visible:outline-none"
				aria-label={`Remove filter ${label}`}
			>
				<Icon name="x" size={12} className="ic" />
			</button>
		</span>
	)
}

function taskLabel(value: string): string {
	switch (value) {
		case 'running':
			return 'Running'
		case 'needs':
			return 'Needs you'
		case 'review':
			return 'Review'
		case 'shipped':
			return 'Shipped'
		default:
			return value
	}
}

function createdLabel(value: string): string {
	switch (value) {
		case '24h':
			return 'Last 24h'
		case '7d':
			return 'Last 7d'
		case '30d':
			return 'Last 30d'
		default:
			return value
	}
}

function completedLabel(value: string): string {
	switch (value) {
		case '3d':
			return 'Last 3d'
		case '7d':
			return 'Last 7d'
		case '30d':
			return 'Last 30d'
		default:
			return value
	}
}

function SelectControl<T extends string>({
	label,
	value,
	options,
	onChange,
	icon
}: {
	label: string
	value: T
	options: [T, string][]
	onChange: (next: T) => void
	icon?: 'history' | 'flag' | 'clock'
}) {
	const [open, setOpen] = useState(false)
	const current = options.find(([v]) => v === value)?.[1] ?? value
	return (
		<Popover.Root open={open} onOpenChange={setOpen}>
			<Popover.Trigger
				render={(props) => (
					<button {...props} type="button" className="fchip" aria-label={label}>
						{icon ? <Icon name={icon} size={13} className="ic" /> : null}
						<span className="k">{label}</span>
						<span className="v">{current}</span>
					</button>
				)}
			/>
			<PopoverPopup popupClassName="min-w-32 py-1">
				{options.map(([v, optionLabel]) => {
					const active = v === value
					return (
						<button
							key={v}
							type="button"
							onClick={() => {
								onChange(v)
								setOpen(false)
							}}
							className={cn(
								'flex h-7 w-full items-center justify-between px-2.5 text-left text-[12px] transition-colors hover:bg-overlay',
								active ? 'text-fg' : 'text-fg-muted'
							)}
						>
							<span>{optionLabel}</span>
							{active ? <Icon name="check" size={12} className="text-accent" /> : null}
						</button>
					)
				})}
			</PopoverPopup>
		</Popover.Root>
	)
}
