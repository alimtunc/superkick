import type { ReactNode } from 'react'

import { ErrorState } from '@/components/ui/state-error'
import { LoadingState } from '@/components/ui/state-loading'
import { cn } from '@/lib/utils'
import type { LaunchStepKind, LaunchTaskStep, LaunchTaskStepStatus } from '@/types'

interface LaunchTaskStepsBodyProps {
	isLoading: boolean
	isError: boolean
	error: unknown
	onRetry: () => void
	steps: readonly LaunchTaskStep[]
	currentStep: LaunchTaskStep | null
}

const STEP_KIND_LABEL: Record<LaunchStepKind, string> = {
	plan: 'Plan',
	implement: 'Implement',
	review: 'Review'
}

const STEP_STATUS_LABEL: Record<LaunchTaskStepStatus, string> = {
	pending: 'Pending',
	running: 'Running',
	completed: 'Completed',
	failed: 'Failed',
	needs_human: 'Needs human',
	skipped: 'Skipped',
	cancelled: 'Cancelled'
}

function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : 'Unknown error'
}

/**
 * SUP-117 — render slot inside `LaunchTaskActivePanel`. Owns the
 * loading/error/list branching so the parent can read as a flat sequence of
 * sections instead of a nested ternary (per `feedback_no_double_ternary`).
 */
export function LaunchTaskStepsBody({
	isLoading,
	isError,
	error,
	onRetry,
	steps,
	currentStep
}: LaunchTaskStepsBodyProps): ReactNode {
	if (isLoading) {
		return <LoadingState rows={3} density="compact" />
	}
	if (isError) {
		return <ErrorState message={errorMessage(error)} onRetry={onRetry} density="compact" />
	}
	return (
		<ol className="flex flex-col gap-1">
			{steps.map((step) => {
				const isCurrent = currentStep?.id === step.id
				return (
					<li
						key={step.id}
						className={cn(
							'flex items-center justify-between gap-3 rounded border px-3 py-2',
							isCurrent ? 'bg-carbon-dim border-edge-bright' : 'border-edge bg-carbon'
						)}
					>
						<div className="flex items-center gap-2">
							<span className="font-data text-[10px] text-dim">{step.sequence}.</span>
							<span className="font-data text-[12px] text-fog">
								{STEP_KIND_LABEL[step.step_kind]}
							</span>
							<span className="font-data text-[10px] text-dim">— {step.agent_name}</span>
						</div>
						<span className="font-data text-[10px] tracking-wider text-dim uppercase">
							{STEP_STATUS_LABEL[step.status]}
						</span>
					</li>
				)
			})}
		</ol>
	)
}
