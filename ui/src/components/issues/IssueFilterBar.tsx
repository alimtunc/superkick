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
					label={chip.label}
					onRemove={() => onFiltersChange(removeChip(filters, chip))}
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
	label: string
	axis: 'assignee' | 'status' | 'status_not' | 'priority' | 'label' | 'label_not' | 'project'
	value: string | number
}

function buildChips(filters: IssueFilterState, options: FilterOptionSet): ChipDescriptor[] {
	const chips: ChipDescriptor[] = []
	for (const id of filters.assignee) {
		const found = options.assignees.find((a) => a.id === id)
		chips.push({
			key: `assignee:${id}`,
			label: `Assignee = ${found?.name ?? id}`,
			axis: 'assignee',
			value: id
		})
	}
	for (const st of filters.status) {
		const found = options.statuses.find((s) => s.state_type === st)
		chips.push({ key: `status:${st}`, label: `Status = ${found?.name ?? st}`, axis: 'status', value: st })
	}
	for (const st of filters.status_not) {
		const found = options.statuses.find((s) => s.state_type === st)
		chips.push({
			key: `status_not:${st}`,
			label: `Status ≠ ${found?.name ?? st}`,
			axis: 'status_not',
			value: st
		})
	}
	for (const p of filters.priority) {
		const found = options.priorities.find((pr) => pr.value === p)
		chips.push({
			key: `priority:${p}`,
			label: `Priority = ${found?.label ?? p}`,
			axis: 'priority',
			value: p
		})
	}
	for (const l of filters.label) {
		chips.push({ key: `label:${l}`, label: `Label = ${l}`, axis: 'label', value: l })
	}
	for (const l of filters.label_not) {
		chips.push({ key: `label_not:${l}`, label: `Label ≠ ${l}`, axis: 'label_not', value: l })
	}
	for (const p of filters.project) {
		chips.push({ key: `project:${p}`, label: `Project = ${p}`, axis: 'project', value: p })
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

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
	return (
		<span className="inline-flex h-6 items-center gap-1 rounded bg-raised px-2 text-[11px] text-fg">
			<span>{label}</span>
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
