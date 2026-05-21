import { MenuPopup } from '@/components/ui/menu-shell'
import { cn } from '@/lib/utils'
import type { LaunchWorktreeStrategy } from '@/types'
import { Icon } from '@/ui/Icon'
import { Menu } from '@base-ui/react/menu'

interface WorktreeStrategyChipProps {
	value: LaunchWorktreeStrategy
	onChange: (next: LaunchWorktreeStrategy) => void
}

interface StrategyOption {
	value: LaunchWorktreeStrategy
	label: string
	hint: string
}

const OPTIONS: readonly StrategyOption[] = [
	{
		value: 'new_worktree',
		label: 'new worktree',
		hint: 'Fresh worktree from the base branch — isolated from other tasks'
	},
	{
		value: 'current_checkout',
		label: 'current checkout',
		hint: 'Run in the configured repo checkout — shares state with other launches'
	}
] as const

export function WorktreeStrategyChip({ value, onChange }: WorktreeStrategyChipProps) {
	const current = OPTIONS.find((o) => o.value === value)?.label ?? value
	return (
		<Menu.Root>
			<Menu.Trigger
				aria-label={`Worktree strategy: ${current}`}
				className={cn(
					'inline-flex items-center gap-[7px] rounded-[7px] border border-transparent bg-raised px-2.5 py-[5px] text-[12.5px] transition-colors',
					'focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none',
					'hover:border-border-strong'
				)}
			>
				<Icon name="folder" size={13} className="text-fg-muted" />
				<span className="text-fg-dim">worktree</span>
				<span className="font-medium text-fg">{current}</span>
				<Icon name="chevDown" size={11} className="text-fg-dim" />
			</Menu.Trigger>
			<MenuPopup align="start" popupClassName="w-72">
				<Menu.RadioGroup
					value={value}
					onValueChange={(next) => onChange(next as LaunchWorktreeStrategy)}
				>
					{OPTIONS.map((opt) => (
						<Menu.RadioItem
							key={opt.value}
							value={opt.value}
							className={cn(
								'flex cursor-pointer items-start gap-2 px-3 py-2 text-[12.5px] outline-none',
								'data-highlighted:bg-raised data-checked:bg-raised'
							)}
						>
							<span className="flex-1">
								<span className="block text-fg">{opt.label}</span>
								<span className="block text-[10.5px] text-fg-dim">{opt.hint}</span>
							</span>
							<Menu.RadioItemIndicator className="mt-0.5 text-fg">
								<Icon name="check" size={13} />
							</Menu.RadioItemIndicator>
						</Menu.RadioItem>
					))}
				</Menu.RadioGroup>
			</MenuPopup>
		</Menu.Root>
	)
}
