import { useProjectSwitchStore } from '@/stores/projectSwitch'

export function ProjectSwitchOverlay() {
	const message = useProjectSwitchStore((s) => s.message)
	if (message === null) return null

	return (
		<div
			data-testid="project-switch-shield"
			className="pointer-events-auto fixed inset-0 z-50 bg-canvas/20 backdrop-blur-[1.5px]"
		>
			<output
				aria-live="polite"
				aria-label={message}
				className="project-switch-hud absolute top-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-md border border-border-strong bg-overlay px-4 py-2.5 text-[13px] text-fg shadow-lg transition-[opacity,transform] duration-150 ease-out"
			>
				<div
					className="size-3.5 animate-spin rounded-full border-2 border-border border-t-accent"
					aria-hidden="true"
				/>
				<span>{message}</span>
			</output>
		</div>
	)
}
