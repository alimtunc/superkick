import { useRunDrawerStore } from '@/stores/runDrawer'

interface OpenRunButtonProps {
	runId: string
}

export function OpenRunButton({ runId }: OpenRunButtonProps) {
	const openDrawer = useRunDrawerStore((s) => s.openDrawer)
	return (
		<button
			type="button"
			onClick={() => openDrawer(runId, 'activity')}
			className="font-data inline-flex h-6 items-center rounded px-1.5 text-[11px] text-accent transition-colors hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
		>
			Open run →
		</button>
	)
}
