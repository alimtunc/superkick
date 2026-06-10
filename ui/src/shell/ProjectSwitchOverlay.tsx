import { useProjectSwitchStore } from '@/stores/projectSwitch'

export function ProjectSwitchOverlay() {
	const message = useProjectSwitchStore((s) => s.message)
	if (message === null) return null

	return (
		<div className="fixed inset-0 z-50 grid place-items-center bg-(--bg-scrim) backdrop-blur-sm">
			<div className="flex items-center gap-3 rounded-lg border border-border bg-raised px-5 py-4 text-[13px] text-fg">
				<div
					className="size-4 animate-spin rounded-full border-2 border-border border-t-accent"
					aria-hidden="true"
				/>
				{message}
			</div>
		</div>
	)
}
