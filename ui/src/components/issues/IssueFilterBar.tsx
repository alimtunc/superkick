import { useMemo } from 'react'

import { IssueFilterDropdown, type FilterOptionSet } from '@/components/issues/IssueFilterDropdown'
import { cn } from '@/lib/utils'
import type { IssueFilterState, IssueGroupBy, IssueSort, IssueViewLayout } from '@/types'
import { Icon } from '@/ui'

interface IssueFilterBarProps {
	filters: IssueFilterState
	sort: IssueSort
	group: IssueGroupBy
	layout: IssueViewLayout
	options: FilterOptionSet
	onFiltersChange: (next: IssueFilterState) => void
	onSortChange: (next: IssueSort) => void
	onGroupChange: (next: IssueGroupBy) => void
	onLayoutChange: (next: IssueViewLayout) => void
	dropdownOpen: boolean
	onDropdownOpenChange: (open: boolean) => void
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
	layout,
	options,
	onFiltersChange,
	onSortChange,
	onGroupChange,
	onLayoutChange,
	dropdownOpen,
	onDropdownOpenChange
}: IssueFilterBarProps) {
	const chips = useMemo(() => buildChips(filters, options), [filters, options])

	return (
		<div className="flex h-10 items-center gap-2 border-b border-border bg-surface px-6">
			<IssueFilterDropdown
				filters={filters}
				onChange={onFiltersChange}
				options={options}
				open={dropdownOpen}
				onOpenChange={onDropdownOpenChange}
				trigger={
					<button
						type="button"
						className="inline-flex h-6 items-center gap-1 rounded border border-dashed border-border px-2 text-[11px] text-fg-muted hover:border-border-strong hover:text-fg focus-visible:ring-1 focus-visible:ring-accent-soft focus-visible:outline-none"
					>
						<Icon name="plus" size={11} />
						<span>Filter</span>
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

			<div className="ml-auto flex items-center gap-2">
				<SelectControl
					label="Sort"
					value={sort}
					options={Object.entries(SORT_LABELS) as [IssueSort, string][]}
					onChange={onSortChange}
				/>
				<SelectControl
					label="Group"
					value={group}
					options={Object.entries(GROUP_LABELS) as [IssueGroupBy, string][]}
					onChange={onGroupChange}
				/>
				<LayoutToggle layout={layout} onChange={onLayoutChange} />
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
	return chips
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
	return (
		<span className="inline-flex h-6 items-center gap-1 rounded bg-raised px-2 text-[11px] text-fg">
			<span>{chip.name}</span>
			{canToggleOperator(chip) ? (
				<button
					type="button"
					onClick={onToggleOperator}
					className="font-data text-fg-muted hover:text-fg focus-visible:outline-none"
					aria-label={`Toggle operator for ${label}`}
				>
					{chip.op}
				</button>
			) : (
				<span className="font-data text-fg-muted">{chip.op}</span>
			)}
			<span>{chip.valueLabel}</span>
			<button
				type="button"
				onClick={onRemove}
				className="inline-flex size-4 items-center justify-center text-fg-muted hover:text-fg focus-visible:outline-none"
				aria-label={`Remove filter ${label}`}
			>
				<Icon name="x" size={10} />
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

function SelectControl<T extends string>({
	label,
	value,
	options,
	onChange
}: {
	label: string
	value: T
	options: [T, string][]
	onChange: (next: T) => void
}) {
	return (
		<label className="inline-flex h-7 items-center gap-1 rounded px-1 text-[11px] text-fg-muted hover:text-fg">
			<span>{label}:</span>
			<select
				value={value}
				onChange={(e) => onChange(e.target.value as T)}
				className="appearance-none bg-transparent text-[11px] text-fg outline-none"
			>
				{options.map(([v, optionLabel]) => (
					<option key={v} value={v}>
						{optionLabel}
					</option>
				))}
			</select>
		</label>
	)
}

function LayoutToggle({
	layout,
	onChange
}: {
	layout: IssueViewLayout
	onChange: (next: IssueViewLayout) => void
}) {
	return (
		<div className="inline-flex h-7 items-center gap-px rounded border border-border bg-surface p-px">
			{(['list', 'board'] as const).map((value) => (
				<button
					key={value}
					type="button"
					onClick={() => onChange(value)}
					className={cn(
						'inline-flex h-6 items-center px-2 text-[11px] transition-colors',
						value === layout ? 'bg-raised text-fg' : 'text-fg-muted hover:text-fg'
					)}
				>
					{value === 'list' ? 'List' : 'Board'}
				</button>
			))}
		</div>
	)
}
