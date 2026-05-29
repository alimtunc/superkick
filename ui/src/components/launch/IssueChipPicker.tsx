import type { ReactNode } from 'react'

import { issuesQuery } from '@/lib/queries'
import { cn } from '@/lib/utils'
import type { IssueChipPickerValue, LinearIssueListItem } from '@/types'
import { Icon } from '@/ui/Icon'
import { Combobox } from '@base-ui/react/combobox'
import { useQuery } from '@tanstack/react-query'

interface IssueChipPickerProps {
	value: IssueChipPickerValue | null
	onChange: (next: LinearIssueListItem) => void
	disabled?: boolean
}

function itemToStringLabel(item: LinearIssueListItem): string {
	return item.identifier
}

function isItemEqualToValue(a: LinearIssueListItem, b: LinearIssueListItem): boolean {
	return a.id === b.id
}

function renderIssueItem(item: LinearIssueListItem): ReactNode {
	return (
		<Combobox.Item
			key={item.id}
			value={item}
			className={cn(
				'flex w-full flex-col items-start gap-0.5 rounded-[5px] px-2 py-1.5 text-left transition-colors outline-none',
				'data-highlighted:bg-raised'
			)}
		>
			<span className="flex w-full items-center gap-2">
				<span className="font-mono text-[11.5px] text-fg-muted">{item.identifier}</span>
				<span className="truncate text-[12.5px] text-fg">{item.title}</span>
			</span>
			<span className="text-[10.5px] text-fg-dim">
				{item.status.name}
				{item.priority.label ? ` · ${item.priority.label}` : ''}
			</span>
		</Combobox.Item>
	)
}

export function IssueChipPicker({ value, onChange, disabled }: IssueChipPickerProps) {
	const issuesData = useQuery(issuesQuery())
	const items = issuesData.data?.issues ?? []
	const selected = value ? (items.find((it) => it.id === value.id) ?? null) : null
	const triggerLabel = value ? value.identifier : 'pick…'

	return (
		<Combobox.Root
			items={items}
			value={selected}
			onValueChange={(next) => {
				if (next) onChange(next)
			}}
			itemToStringLabel={itemToStringLabel}
			isItemEqualToValue={isItemEqualToValue}
			disabled={disabled}
			limit={12}
		>
			<Combobox.Trigger
				aria-label="Select issue"
				className={cn('select', disabled ? 'opacity-50' : null)}
			>
				<Icon name="issue" size={14} className="ic text-fg-muted" />
				<span className="text-fg-dim">issue</span>
				<span className={cn('font-medium', value === null ? 'text-fg-dim' : 'text-fg')}>
					{triggerLabel}
				</span>
				<span className="chev">
					<Icon name="chevDown" size={14} className="ic" />
				</span>
			</Combobox.Trigger>
			<Combobox.Portal>
				<Combobox.Positioner
					sideOffset={6}
					align="start"
					collisionPadding={8}
					collisionAvoidance={{ side: 'flip', align: 'shift' }}
					className="z-popover"
				>
					<Combobox.Popup className="flex w-90 flex-col gap-1 rounded-[7px] border border-border bg-surface p-2 shadow-lg">
						<Combobox.Input
							placeholder="Search issues…"
							className="rounded-[5px] border border-border bg-raised px-2 py-1.5 text-[12.5px] text-fg placeholder:text-fg-dim focus:border-border-strong focus:outline-none"
						/>
						<div className="max-h-72 overflow-y-auto">
							<Combobox.Empty className="px-2 py-3 text-[11.5px] text-fg-dim">
								{issuesData.isLoading ? 'Loading…' : 'No matches.'}
							</Combobox.Empty>
							<Combobox.List>{renderIssueItem}</Combobox.List>
						</div>
					</Combobox.Popup>
				</Combobox.Positioner>
			</Combobox.Portal>
		</Combobox.Root>
	)
}
