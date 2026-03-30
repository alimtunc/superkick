interface DurationRowProps {
	label: string
	value: string
	color: string
}

export function DurationRow({ label, value, color }: DurationRowProps) {
	return (
		<div className="flex items-center justify-between">
			<span className="text-[11px] text-silver">{label}</span>
			<span className={`font-data text-sm font-medium ${color}`}>{value}</span>
		</div>
	)
}
