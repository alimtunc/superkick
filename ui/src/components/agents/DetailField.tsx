interface DetailFieldProps {
	label: string
	value: string
}

/** Read-only label/value pair in the agent cockpit's detail grids. */
export function DetailField({ label, value }: DetailFieldProps) {
	return (
		<div className="flex flex-col gap-0.5">
			<span className="text-[12px] text-fg-dim">{label}</span>
			<span className="text-[13px] text-fg">{value}</span>
		</div>
	)
}
