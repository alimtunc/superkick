interface NoProvidersDetectedProps {
	variant?: 'card' | 'inline'
}

export function NoProvidersDetected({ variant = 'card' }: NoProvidersDetectedProps) {
	const wrapper =
		variant === 'card'
			? 'rounded-md border border-edge bg-slate-deep/30 p-6 text-center'
			: 'px-4 py-6 text-center'
	return (
		<div className={wrapper}>
			<p className="font-data text-[12px] text-fog">No agent CLI detected.</p>
			<p className="text-[12px] text-silver">
				Install <span className="font-data text-fog">claude</span> or{' '}
				<span className="font-data text-fog">codex</span> on PATH, then refresh.
			</p>
		</div>
	)
}
