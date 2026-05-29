interface NoProvidersDetectedProps {
	variant?: 'card' | 'inline'
}

export function NoProvidersDetected({ variant = 'card' }: NoProvidersDetectedProps) {
	const wrapper =
		variant === 'card'
			? 'rounded-md border border-border bg-raised/30 p-6 text-center'
			: 'px-4 py-6 text-center'
	return (
		<div className={wrapper}>
			<p className="font-data text-[12px] text-fg">No agent CLI detected.</p>
			<p className="text-[12px] text-fg-muted">
				Install <span className="font-data text-fg">claude</span> or{' '}
				<span className="font-data text-fg">codex</span> on PATH, then refresh.
			</p>
		</div>
	)
}
