interface MetricCardProps {
	label: string
	value: number | string
	sub: string
	color: string
	glow?: boolean
}

const valueColors: Record<string, string> = {
	mineral: 'text-mineral',
	oxide: 'text-oxide',
	cyan: 'text-cyan',
	gold: 'text-gold',
	dim: 'text-silver'
}

export function MetricCard({ label, value, sub, color, glow }: MetricCardProps) {
	const valueColor = valueColors[color] ?? 'text-fog'

	return (
		<div className={`panel p-5 ${glow ? 'glow-red' : ''}`}>
			<p className="font-data mb-3 text-[10px] tracking-wider text-dim uppercase">{label}</p>
			<p className={`font-data text-3xl leading-none font-medium tracking-tight ${valueColor}`}>
				{value}
			</p>
			<p className="font-data mt-3 truncate text-[10px] text-dim">{sub}</p>
		</div>
	)
}
