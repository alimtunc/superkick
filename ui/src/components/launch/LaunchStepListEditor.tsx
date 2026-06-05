import { ConfigSelect } from '@/components/settings/ConfigSelect'
import { Button } from '@/components/ui/button'
import { Pill } from '@/components/ui/pill'
import { providerLabel } from '@/lib/domain'
import {
	EXECUTOR_LABEL,
	EXECUTOR_OPTIONS,
	LAUNCH_PROVIDER_OPTIONS,
	REASONING_LABEL,
	REASONING_OPTIONS,
	isPaidExecutor
} from '@/lib/launchConfigOptions'
import { useLaunchComposerState } from '@/stores/launchComposerState'
import { Icon } from '@/ui/Icon'
import { Toggle } from '@/ui/Toggle'

export function LaunchStepListEditor() {
	const steps = useLaunchComposerState((state) => state.steps)
	const toggleStep = useLaunchComposerState((state) => state.toggleStep)
	const moveStep = useLaunchComposerState((state) => state.moveStep)
	const removeStep = useLaunchComposerState((state) => state.removeStep)
	const updateStep = useLaunchComposerState((state) => state.updateStep)
	const addStep = useLaunchComposerState((state) => state.addStep)

	const sorted = steps.toSorted((a, b) => a.ordering - b.ordering)

	return (
		<div className="flex flex-col gap-2">
			{sorted.map((step, index) => (
				<div
					key={step.ordering}
					className="bg-bg flex flex-wrap items-center gap-2 rounded-[8px] border border-border px-3 py-2"
				>
					<div className="flex flex-col">
						<button
							type="button"
							aria-label={`Move ${step.label} up`}
							disabled={index === 0}
							className="text-fg-dim hover:text-fg disabled:opacity-30"
							onClick={() => moveStep(step.ordering, 'up')}
						>
							<Icon name="chevDown" size={12} className="ic rotate-180" />
						</button>
						<button
							type="button"
							aria-label={`Move ${step.label} down`}
							disabled={index === sorted.length - 1}
							className="text-fg-dim hover:text-fg disabled:opacity-30"
							onClick={() => moveStep(step.ordering, 'down')}
						>
							<Icon name="chevDown" size={12} className="ic" />
						</button>
					</div>
					<span className="w-5 text-[12px] text-fg-dim">{step.ordering}</span>
					<span className="min-w-0 flex-1 truncate text-[13px] text-fg">{step.label}</span>
					{isPaidExecutor(step.executor) ? <Pill tone="warn">paid</Pill> : null}
					<ConfigSelect
						ariaLabel={`${step.label} provider`}
						value={step.provider}
						options={LAUNCH_PROVIDER_OPTIONS}
						labels={providerLabel}
						onChange={(value) => updateStep(step.ordering, { provider: value })}
					/>
					<ConfigSelect
						ariaLabel={`${step.label} executor`}
						value={step.executor}
						options={EXECUTOR_OPTIONS}
						labels={EXECUTOR_LABEL}
						onChange={(value) => updateStep(step.ordering, { executor: value })}
					/>
					<ConfigSelect
						ariaLabel={`${step.label} reasoning`}
						value={step.reasoning}
						options={REASONING_OPTIONS}
						labels={REASONING_LABEL}
						onChange={(value) => updateStep(step.ordering, { reasoning: value })}
					/>
					<Toggle
						checked={step.enabled}
						ariaLabel={`${step.label} enabled`}
						onChange={() => toggleStep(step.ordering)}
					/>
					<button
						type="button"
						aria-label={`Remove ${step.label}`}
						className="text-fg-dim hover:text-danger"
						onClick={() => removeStep(step.ordering)}
					>
						<Icon name="x" size={13} className="ic" />
					</button>
				</div>
			))}
			<div>
				<Button variant="outline" size="sm" onClick={() => addStep()}>
					Add step
				</Button>
			</div>
		</div>
	)
}
