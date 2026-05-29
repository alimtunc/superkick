interface SettingsPaneComingSoonProps {
	label: string
}

export function SettingsPaneComingSoon({ label }: SettingsPaneComingSoonProps) {
	return (
		<section>
			<h2 className="mb-1.5 text-[21px] font-semibold tracking-tight text-fg">{label}</h2>
			<p className="mb-[22px] text-[13px] leading-[1.55] text-fg-muted">
				Configuration for {label.toLowerCase()} is not yet available in this build.
			</p>
		</section>
	)
}
