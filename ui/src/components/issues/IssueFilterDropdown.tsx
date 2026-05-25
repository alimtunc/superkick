import { useMemo, useState, type ReactElement, type ReactNode } from 'react'

import { PopoverPopup } from '@/components/ui/popover-shell'
import { cn } from '@/lib/utils'
import type { IssueFilterState, IssueLabel, IssuePriority, TaskBadgeKind } from '@/types'
import type { SKIconName } from '@/types/icons'
import { Icon, PriorityIcon } from '@/ui'
import { Popover } from '@base-ui/react/popover'

type AxisKey =
	| 'assignee'
	| 'status'
	| 'priority'
	| 'label'
	| 'project'
	| 'repo'
	| 'task'
	| 'created'
	| 'updated'
	| 'completed'
	| 'has_sub_issues'

interface IssueFilterDropdownProps {
	filters: IssueFilterState
	onChange: (next: IssueFilterState) => void
	options: FilterOptionSet
	trigger: ReactElement
	open?: boolean
	onOpenChange?: (open: boolean) => void
}

export interface FilterOptionSet {
	assignees: { id: string; name: string }[]
	statuses: { state_type: string; name: string }[]
	priorities: IssuePriority[]
	labels: IssueLabel[]
	projects: string[]
	repos: string[]
}

interface AxisDef {
	key: AxisKey
	label: string
	icon: SKIconName
	meta?: string
}

// Cycle / Milestone / Creator / Estimate intentionally absent: the list
// query does not expose them today, so they cannot be applied honestly.
const AXES: AxisDef[] = [
	{ key: 'assignee', label: 'Assignee', icon: 'user' },
	{ key: 'status', label: 'Status', icon: 'spark' },
	{ key: 'priority', label: 'Priority', icon: 'alert' },
	{ key: 'label', label: 'Label', icon: 'pin' },
	{ key: 'project', label: 'Project', icon: 'folder' },
	{ key: 'repo', label: 'Repo', icon: 'branch' },
	{ key: 'task', label: 'Task state', icon: 'loop', meta: 'running · needs · review · shipped' },
	{ key: 'created', label: 'Created', icon: 'clock', meta: 'date…' },
	{ key: 'updated', label: 'Updated', icon: 'clock', meta: 'date…' },
	{ key: 'completed', label: 'Completed', icon: 'check', meta: 'date…' },
	{ key: 'has_sub_issues', label: 'Has sub-issues', icon: 'layers', meta: 'yes · no' }
]

const TASK_OPTIONS: { value: TaskBadgeKind; label: string }[] = [
	{ value: 'running', label: 'Running' },
	{ value: 'needs', label: 'Needs you' },
	{ value: 'review', label: 'Review' },
	{ value: 'shipped', label: 'Shipped' }
]

const CREATED_OPTIONS = [
	{ value: '24h', label: 'Last 24h' },
	{ value: '7d', label: 'Last 7d' },
	{ value: '30d', label: 'Last 30d' }
]

const UPDATED_OPTIONS = CREATED_OPTIONS

const COMPLETED_OPTIONS = [
	{ value: '3d', label: 'Last 3d' },
	{ value: '7d', label: 'Last 7d' },
	{ value: '30d', label: 'Last 30d' }
]

const HAS_SUB_ISSUES_OPTIONS = [
	{ value: 'yes', label: 'Yes' },
	{ value: 'no', label: 'No' }
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
	const [query, setQuery] = useState('')

	const matchedAxes = useMemo(() => {
		const q = query.trim().toLowerCase()
		if (q === '') return AXES
		return AXES.filter((axis) => axis.label.toLowerCase().includes(q))
	}, [query])

	function close() {
		onOpenChange?.(false)
	}

	function resetAndClose() {
		setActiveAxis(null)
		setQuery('')
		close()
	}

	return (
		<Popover.Root
			open={open}
			onOpenChange={(next) => {
				if (!next) {
					setActiveAxis(null)
					setQuery('')
				}
				onOpenChange?.(next)
			}}
		>
			<Popover.Trigger render={trigger} />
			<PopoverPopup
				align="start"
				sideOffset={6}
				popupClassName="w-66 border border-border bg-overlay shadow-xl"
			>
				{activeAxis === null ? (
					<div className="flex flex-col">
						<div className="flex items-center gap-1.5 border-b border-border px-2.5 py-2">
							<Icon name="search" size={12} className="text-fg-dim" />
							<input
								autoFocus
								aria-label="Filter axes"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder="Filter…"
								className="flex-1 bg-transparent text-[12.5px] text-fg placeholder:text-fg-dim focus-visible:outline-none"
							/>
						</div>
						<div className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold tracking-[0.08em] text-fg-dim uppercase">
							Filter by
						</div>
						<ul className="max-h-72 overflow-y-auto pb-1">
							{matchedAxes.length === 0 ? (
								<li className="px-3 py-2 text-[11.5px] text-fg-dim">No matching filters.</li>
							) : (
								matchedAxes.map((axis) => (
									<li key={axis.key}>
										<button
											type="button"
											onClick={() => setActiveAxis(axis.key)}
											className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-fg hover:bg-raised focus-visible:bg-raised focus-visible:outline-none"
										>
											<Icon
												name={axis.icon}
												size={12}
												className="shrink-0 text-fg-muted"
											/>
											<span className="flex-1 truncate">{axis.label}</span>
											{axis.meta ? (
												<span className="ml-auto text-[11px] text-fg-dim">
													{axis.meta}
												</span>
											) : (
												<Icon name="chev" size={11} className="text-fg-dim" />
											)}
										</button>
									</li>
								))
							)}
						</ul>
					</div>
				) : (
					<AxisPicker
						axis={activeAxis}
						filters={filters}
						onChange={onChange}
						options={options}
						onBack={() => setActiveAxis(null)}
						onApply={resetAndClose}
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
	onBack,
	onApply
}: {
	axis: AxisKey
	filters: IssueFilterState
	onChange: (next: IssueFilterState) => void
	options: FilterOptionSet
	onBack: () => void
	onApply: () => void
}) {
	const items = pickerItems(axis, options)

	function toggle(value: string | number) {
		onChange(toggleFilterValue(filters, axis, value))
	}

	return (
		<div className="flex flex-col">
			<div className="flex h-8 items-center gap-1 border-b border-border px-2">
				<button
					type="button"
					onClick={onBack}
					className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11.5px] font-medium text-fg-dim hover:bg-raised hover:text-fg focus-visible:outline-none"
					aria-label="Back to filter list"
				>
					<Icon name="chev" size={11} className="rotate-180" />
					<span>{axisLabel(axis)}</span>
				</button>
				<span className="ml-auto">
					<button
						type="button"
						onClick={onApply}
						className="inline-flex h-6 items-center rounded px-1.5 text-[11.5px] text-fg-dim hover:text-fg focus-visible:outline-none"
					>
						Done
					</button>
				</span>
			</div>
			<ul className="max-h-72 overflow-y-auto py-1">
				{items.map((item) => {
					const selected = isSelected(filters, axis, item.value)
					return (
						<li key={String(item.value)}>
							<button
								type="button"
								onClick={() => toggle(item.value)}
								className={cn(
									'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] hover:bg-raised focus-visible:bg-raised focus-visible:outline-none',
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
		case 'repo':
			return options.repos.map((r) => ({ value: r, label: r }))
		case 'task':
			return TASK_OPTIONS
		case 'created':
			return CREATED_OPTIONS
		case 'updated':
			return UPDATED_OPTIONS
		case 'completed':
			return COMPLETED_OPTIONS
		case 'has_sub_issues':
			return HAS_SUB_ISSUES_OPTIONS
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
		case 'repo':
			return filters.repo.includes(value as string)
		case 'task':
			return filters.task.includes(value as string)
		case 'created':
			return filters.created.includes(value as string)
		case 'updated':
			return filters.updated.includes(value as string)
		case 'completed':
			return filters.completed.includes(value as string)
		case 'has_sub_issues':
			return filters.has_sub_issues.includes(value as string)
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
	const key: Exclude<AxisKey, 'priority'> = axis
	const current = filters[key]
	const next = current.includes(value as string)
		? current.filter((v) => v !== value)
		: [...current, value as string]
	return { ...filters, [key]: next }
}
