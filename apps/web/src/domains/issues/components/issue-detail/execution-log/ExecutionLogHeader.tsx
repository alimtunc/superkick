import type { ReactNode } from 'react'

import { Btn, Icon } from '@/components/primitives'
import { RunChip, type RunChipVariant } from '@/domains/runs/components/run-shared/RunChip'
import { useRunDrawerStore } from '@/stores/runDrawer'
import type { LaunchTaskStep, LinkedRunSummary, RunState } from '@/types'

type HeaderKind = 'running' | 'needs' | 'done'

interface ExecutionLogHeaderProps {
	kind: HeaderKind
	currentStep: LaunchTaskStep | null
	run: LinkedRunSummary | null
	cancel?: ReactNode
}

interface ChipMeta {
	tone: RunChipVariant
	label: string
}

function chipFor(kind: HeaderKind, runState: RunState | null): ChipMeta {
	if (kind === 'needs') return { tone: 'needs', label: 'Needs you' }
	if (kind === 'running') return { tone: 'running', label: 'Coding' }
	if (runState === 'failed') return { tone: 'failed', label: 'Failed' }
	if (runState === 'cancelled') return { tone: 'failed', label: 'Cancelled' }
	return { tone: 'done', label: 'Completed' }
}

export function ExecutionLogHeader({ kind, currentStep, run, cancel }: ExecutionLogHeaderProps) {
	const openDrawer = useRunDrawerStore((s) => s.openDrawer)
	const chip = chipFor(kind, run?.state ?? null)
	const agentName = currentStep?.agent_name ?? null
	const modelLabel = currentStep?.model ?? null
	const runId = run?.id ?? null
	const runIdLabel = [runId, agentName].filter(Boolean).join(' · ')

	return (
		<header className="execlog__head">
			<Icon name="zap" size={15} className="ic" />
			{runIdLabel ? <span className="execlog__run-id mono">{runIdLabel}</span> : null}
			<span className="spacer" />
			{modelLabel ? <span className="pill pill--neutral">{modelLabel}</span> : null}
			<RunChip variant={chip.tone} label={chip.label} glyph="icon" />
			{cancel ?? null}
			{run ? (
				<Btn kind="ghost" size="sm" icon="external" onClick={() => openDrawer(run.id, 'activity')}>
					Open run
				</Btn>
			) : null}
		</header>
	)
}
