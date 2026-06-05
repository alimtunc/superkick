interface ConfigSelectProps<T extends string> {
	value: T
	options: readonly T[]
	labels: Record<T, string>
	onChange: (value: T) => void
	ariaLabel: string
	disabled?: boolean
}

export function ConfigSelect<T extends string>({
	value,
	options,
	labels,
	onChange,
	ariaLabel,
	disabled
}: ConfigSelectProps<T>) {
	return (
		<select
			aria-label={ariaLabel}
			disabled={disabled}
			className="rounded-[6px] border border-border bg-raised px-2 py-1 text-[13px] text-fg disabled:opacity-50"
			value={value}
			onChange={(e) => onChange(e.target.value as T)}
		>
			{options.map((option) => (
				<option key={option} value={option}>
					{labels[option]}
				</option>
			))}
		</select>
	)
}
