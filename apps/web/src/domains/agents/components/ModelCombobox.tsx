import { ComboboxPopup } from '@/components/composites/combobox-shell'
import { Icon } from '@/components/primitives'
import { cn } from '@/lib/utils'
import type { ModelInfo } from '@/types'
import { Combobox } from '@base-ui/react/combobox'

interface ModelComboboxProps {
	value: string | null
	models: ModelInfo[]
	onChange: (model: string | null) => void
	disabled?: boolean
	ariaLabel?: string
}

export function ModelCombobox({
	value,
	models,
	onChange,
	disabled,
	ariaLabel = 'Model'
}: ModelComboboxProps) {
	return (
		<Combobox.Root
			items={models}
			itemToStringLabel={(model: ModelInfo) => model.id}
			inputValue={value ?? ''}
			onInputValueChange={(text) => onChange(text.trim() || null)}
			disabled={disabled}
		>
			<div className="relative">
				<Combobox.Input
					placeholder="provider default"
					aria-label={ariaLabel}
					className="w-full rounded-[6px] border border-border bg-raised px-2 py-1 pr-7 text-[13px] text-fg placeholder:text-fg-dim focus:border-border-strong focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
				/>
				<Icon
					name="chevDown"
					size={14}
					className="ic pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-fg-dim"
				/>
			</div>
			<ComboboxPopup popupClassName="w-64 gap-0.5 p-1">
				<Combobox.Empty className="px-2 py-3 text-[11.5px] text-fg-dim">
					No suggested models — type a model id.
				</Combobox.Empty>
				<Combobox.List>
					{(model: ModelInfo) => (
						<Combobox.Item
							key={model.id}
							value={model}
							className={cn(
								'flex cursor-pointer flex-col items-start gap-0.5 rounded-[5px] px-2 py-1.5 text-left transition-colors outline-none',
								'data-highlighted:bg-raised'
							)}
						>
							<span className="text-[12.5px] font-medium text-fg">{model.id}</span>
							<span className="text-[11px] text-fg-dim">{model.label}</span>
						</Combobox.Item>
					)}
				</Combobox.List>
			</ComboboxPopup>
		</Combobox.Root>
	)
}
