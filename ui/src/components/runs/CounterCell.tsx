export function CounterCell({ label, value, accent }: { label: string; value: number; accent?: string }) {
	return (
		<div className="panel px-3 py-3 text-center">
			<div className={`font-data text-lg font-medium ${accent ?? 'text-fog'}`}>{value}</div>
			<div className="font-data text-[9px] tracking-wider text-dim uppercase">{label}</div>
		</div>
	)
}
