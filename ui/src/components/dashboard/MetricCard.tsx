interface MetricCardProps {
	label: string
	value: number | string
	sub: string
	color: string
	glow?: boolean
}

const valueColors: Record<string, string> = {
	mineral: 'text-success',
	oxide: 'text-danger',
	cyan: 'text-info',
	gold: 'text-warn',
	dim: 'text-fg-muted'
}

export function MetricCard({ label, value, sub, color, glow }: MetricCardProps) {
	const valueColor = valueColors[color] ?? 'text-fg'

	return (
		<div className={`panel p-5 ${glow ? 'glow-red' : ''}`}>
			<p className="font-data mb-3 text-[10px] tracking-wider text-fg-dim uppercase">{label}</p>
			<p className={`font-data text-3xl leading-none font-medium tracking-tight ${valueColor}`}>
				{value}
			</p>
			<p className="font-data mt-3 truncate text-[10px] text-fg-dim">{sub}</p>
		</div>
	)
}
