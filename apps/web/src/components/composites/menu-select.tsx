import { MENU_ITEM_CLASS, MenuPopup } from '@/components/composites/menu-shell'
import { Icon } from '@/components/primitives'
import { Menu } from '@base-ui/react/menu'

interface MenuSelectProps<T extends string> {
	value: T
	options: readonly T[]
	labels: Record<T, string>
	onChange: (value: T) => void
	ariaLabel: string
	disabled?: boolean
}

export function MenuSelect<T extends string>({
	value,
	options,
	labels,
	onChange,
	ariaLabel,
	disabled
}: MenuSelectProps<T>) {
	return (
		<Menu.Root>
			<Menu.Trigger aria-label={ariaLabel} disabled={disabled} className="select">
				<span className="font-medium text-fg">{labels[value]}</span>
				<span className="chev">
					<Icon name="chevDown" size={14} className="ic" />
				</span>
			</Menu.Trigger>
			<MenuPopup align="start">
				<Menu.RadioGroup value={value} onValueChange={(next) => onChange(next as T)}>
					{options.map((option) => (
						<Menu.RadioItem key={option} value={option} className={MENU_ITEM_CLASS}>
							<span className="flex-1">{labels[option]}</span>
							<Menu.RadioItemIndicator className="text-fg">
								<Icon name="check" size={13} />
							</Menu.RadioItemIndicator>
						</Menu.RadioItem>
					))}
				</Menu.RadioGroup>
			</MenuPopup>
		</Menu.Root>
	)
}
