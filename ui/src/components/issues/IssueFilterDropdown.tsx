import { useMemo, useState, type ReactElement, type ReactNode } from 'react'

import { PopoverPopup } from '@/components/ui/popover-shell'
import { cn } from '@/lib/utils'
import type { FilterOptionSet, IssueFilterState, TaskBadgeKind } from '@/types'
import type { SKIconName } from '@/types/icons'
import { Icon, PriorityIcon, priorityIconKindFromValue } from '@/ui'
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

/** Facets the list query cannot apply yet — shown disabled per §10.3
 *  ("don't drop any of these even if the data isn't wired up"). */
type UnwiredAxisKey = 'creator' | 'milestone' | 'cycle' | 'estimate'

interface AxisDef {
	key: AxisKey
	label: string
	icon: SKIconName
	meta?: string
	/** Superkick-specific facet — flagged with the SK provenance tag. */
	sk?: boolean
}

interface UnwiredAxisDef {
	key: UnwiredAxisKey
	label: string
	icon: SKIconName
}

const UNWIRED_AXES: Record<UnwiredAxisKey, UnwiredAxisDef> = {
	creator: { key: 'creator', label: 'Creator', icon: 'user' },
	milestone: { key: 'milestone', label: 'Milestone', icon: 'flag' },
	cycle: { key: 'cycle', label: 'Cycle', icon: 'history' },
	estimate: { key: 'estimate', label: 'Estimate', icon: 'spark' }
}

type DropdownRow = { kind: 'axis'; axis: AxisDef } | { kind: 'unwired'; axis: UnwiredAxisDef }

// §10.3 mandatory ordering: Assignee · Creator · Priority · Status · Label ·
// Project · Repo · Milestone · Cycle · Estimate · Created · Updated ·
// Completed · Has sub-issues · Task state (SK).
const ROWS: DropdownRow[] = [
	{ kind: 'axis', axis: { key: 'assignee', label: 'Assignee', icon: 'user' } },
	{ kind: 'unwired', axis: UNWIRED_AXES.creator },
	{ kind: 'axis', axis: { key: 'priority', label: 'Priority', icon: 'alert' } },
	{ kind: 'axis', axis: { key: 'status', label: 'Status', icon: 'spark' } },
	{ kind: 'axis', axis: { key: 'label', label: 'Label', icon: 'pin' } },
	{ kind: 'axis', axis: { key: 'project', label: 'Project', icon: 'folder' } },
	{ kind: 'axis', axis: { key: 'repo', label: 'Repo', icon: 'branch' } },
	{ kind: 'unwired', axis: UNWIRED_AXES.milestone },
	{ kind: 'unwired', axis: UNWIRED_AXES.cycle },
	{ kind: 'unwired', axis: UNWIRED_AXES.estimate },
	{ kind: 'axis', axis: { key: 'created', label: 'Created', icon: 'clock', meta: 'date…' } },
	{ kind: 'axis', axis: { key: 'updated', label: 'Updated', icon: 'clock', meta: 'date…' } },
	{ kind: 'axis', axis: { key: 'completed', label: 'Completed', icon: 'check', meta: 'date…' } },
	{
		kind: 'axis',
		axis: { key: 'has_sub_issues', label: 'Has sub-issues', icon: 'layers', meta: 'yes · no' }
	},
	{ kind: 'axis', axis: { key: 'task', label: 'Task state', icon: 'loop', sk: true } }
]

const AXES: AxisDef[] = ROWS.flatMap((row) => (row.kind === 'axis' ? [row.axis] : []))

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

	const matchedRows = useMemo(() => {
		const q = query.trim().toLowerCase()
		if (q === '') return ROWS
		return ROWS.filter((row) => row.axis.label.toLowerCase().includes(q))
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
				popupClassName="w-[240px] rounded-[8px] border border-border bg-overlay shadow-[0_18px_40px_rgba(0,0,0,0.5)]"
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
						<div className="px-2.5 pt-1.5 pb-1 text-[10.5px] font-semibold tracking-[0.08em] text-fg-dim uppercase">
							Filter by
						</div>
						<ul className="max-h-72 overflow-y-auto pb-1">
							{matchedRows.length === 0 ? (
								<li className="px-3 py-2 text-[11.5px] text-fg-dim">No matching filters.</li>
							) : (
								matchedRows.map((row) =>
									row.kind === 'unwired' ? (
										<li key={row.axis.key}>
											<div
												aria-disabled
												title="Not wired yet"
												className="flex w-full cursor-default items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-fg-dim"
											>
												<Icon
													name={row.axis.icon}
													size={13}
													className="shrink-0 text-fg-dim"
												/>
												<span className="flex-1 truncate">{row.axis.label}</span>
												<span className="ml-auto text-[11px] text-fg-dim">Soon</span>
											</div>
										</li>
									) : (
										<li key={row.axis.key}>
											<button
												type="button"
												onClick={() => setActiveAxis(row.axis.key)}
												className={cn(
													'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-fg hover:bg-raised focus-visible:bg-raised focus-visible:outline-none',
													row.axis.sk ? 'bg-raised' : null
												)}
											>
												<Icon
													name={row.axis.icon}
													size={13}
													className="shrink-0 text-fg-muted"
												/>
												<span className="flex-1 truncate">{row.axis.label}</span>
												<AxisTrailing axis={row.axis} />
											</button>
										</li>
									)
								)
							)}
						</ul>
						<div className="mx-1 my-1 h-px bg-border" />
						<button
							type="button"
							disabled
							title="Saved views — coming soon"
							className="flex w-full cursor-default items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-fg-muted"
						>
							<Icon name="filter" size={13} className="shrink-0 text-fg-dim" />
							<span>Save current as view…</span>
						</button>
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

function AxisTrailing({ axis }: { axis: AxisDef }) {
	if (axis.sk) {
		return (
			<span className="rounded-[3px] border border-accent-line px-1 text-[9.5px] font-semibold tracking-[0.03em] text-accent uppercase">
				SK
			</span>
		)
	}
	if (axis.meta) {
		return <span className="ml-auto text-[11px] text-fg-dim">{axis.meta}</span>
	}
	return <Icon name="chev" size={11} className="text-fg-dim" />
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
				leading: <PriorityIcon kind={priorityIconKindFromValue(p.value)} size={12} />
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

function axisLabel(axis: AxisKey): string {
	const found = AXES.find((a) => a.key === axis)
	return found ? found.label : axis
}

type StringAxisKey = Exclude<AxisKey, 'priority'>
type AxisValue = { axis: 'priority'; value: number } | { axis: StringAxisKey; value: string }

function axisValue(axis: AxisKey, value: string | number): AxisValue {
	return axis === 'priority' ? { axis, value: Number(value) } : { axis, value: String(value) }
}

function isSelected(filters: IssueFilterState, axis: AxisKey, value: string | number): boolean {
	const av = axisValue(axis, value)
	if (av.axis === 'priority') return filters.priority.includes(av.value)
	return filters[av.axis].includes(av.value)
}

function toggleFilterValue(
	filters: IssueFilterState,
	axis: AxisKey,
	value: string | number
): IssueFilterState {
	const av = axisValue(axis, value)
	if (av.axis === 'priority') {
		const current = filters.priority
		const next = current.includes(av.value)
			? current.filter((v) => v !== av.value)
			: [...current, av.value]
		return { ...filters, priority: next }
	}
	const current = filters[av.axis]
	const next = current.includes(av.value) ? current.filter((v) => v !== av.value) : [...current, av.value]
	return { ...filters, [av.axis]: next }
}
