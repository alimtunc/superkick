import { LoadingState } from '@/components/ui/state-loading'

export function ExecutionLogLoading() {
	return (
		<section
			aria-label="Execution log loading"
			className="rounded-[10px] border border-border bg-surface px-3.5 py-3"
		>
			<LoadingState rows={2} density="compact" />
		</section>
	)
}
