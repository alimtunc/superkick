interface KpiCellProps {
	label: string
	value: number | string
	alert?: boolean
}

export function KpiCell({ label, value, alert }: KpiCellProps) {
	return (
		<div
			className={`rounded border px-3 py-2.5 ${
				alert ? 'border-danger/30 bg-danger-soft' : 'border-border bg-surface/50'
			}`}
		>
			<p className="font-data text-[9px] leading-tight tracking-wider text-fg-dim uppercase">{label}</p>
			<p className={`font-data mt-1 text-base font-medium ${alert ? 'text-danger' : 'text-fg'}`}>
				{value}
			</p>
		</div>
	)
}
