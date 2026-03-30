interface KpiCellProps {
	label: string
	value: number | string
	alert?: boolean
}

export function KpiCell({ label, value, alert }: KpiCellProps) {
	return (
		<div
			className={`rounded border px-3 py-2.5 ${
				alert ? 'border-oxide/30 bg-oxide-dim' : 'border-edge bg-graphite/50'
			}`}
		>
			<p className="font-data text-[9px] leading-tight tracking-wider text-dim uppercase">{label}</p>
			<p className={`font-data mt-1 text-base font-medium ${alert ? 'text-oxide' : 'text-fog'}`}>
				{value}
			</p>
		</div>
	)
}
