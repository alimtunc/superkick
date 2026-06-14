import { MenuPopup } from '@/components/ui/menu-shell'
import { cn } from '@/lib/utils'
import type { LaunchWorktreeStrategy, ReusableWorktree } from '@/types'
import { Icon } from '@/ui/Icon'
import { Menu } from '@base-ui/react/menu'

interface WorktreeStrategyChipProps {
	value: LaunchWorktreeStrategy
	onChange: (next: LaunchWorktreeStrategy) => void
	/** The worktree from this issue's last finished task, or `null` when none exists. */
	reusable: ReusableWorktree | null
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
	},
	{
		value: 'reuse_worktree',
		label: 'reuse worktree',
		hint: "Continue in the worktree from this issue's last finished task"
	}
] as const

export function WorktreeStrategyChip({ value, onChange, reusable }: WorktreeStrategyChipProps) {
	const options = reusable ? OPTIONS : OPTIONS.filter((o) => o.value !== 'reuse_worktree')
	const current = options.find((o) => o.value === value)?.label ?? value
	return (
		<Menu.Root>
			<Menu.Trigger aria-label={`Worktree strategy: ${current}`} className="select">
				<Icon name="folder" size={14} className="ic text-fg-muted" />
				<span className="text-fg-dim">worktree</span>
				<span className="font-medium text-fg">{current}</span>
				<span className="chev">
					<Icon name="chevDown" size={14} className="ic" />
				</span>
			</Menu.Trigger>
			<MenuPopup align="start" popupClassName="w-72">
				<Menu.RadioGroup
					value={value}
					onValueChange={(next) => onChange(next as LaunchWorktreeStrategy)}
				>
					{options.map((opt) => (
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
