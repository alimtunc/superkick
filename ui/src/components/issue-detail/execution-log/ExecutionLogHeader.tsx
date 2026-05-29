import { Fragment, type ReactNode } from 'react'

import { ExecStateChip } from '@/components/issue-detail/execution-log/ExecStateChip'
import { useNow } from '@/hooks/useNow'
import { agentColor, fmtElapsed } from '@/lib/domain'
import { useRunDrawerStore } from '@/stores/runDrawer'
import type { LaunchTaskStep, LinkedRunSummary, RunState } from '@/types'
import type { SKTone } from '@/types/icons'
import { Btn } from '@/ui'
import { Bot, Zap } from 'lucide-react'

type HeaderKind = 'running' | 'needs' | 'done'

interface ExecutionLogHeaderProps {
	kind: HeaderKind
	currentStep: LaunchTaskStep | null
	run: LinkedRunSummary | null
}

interface ChipMeta {
	tone: SKTone
	label: string
	pulse: boolean
}

function chipFor(kind: HeaderKind, runState: RunState | null): ChipMeta {
	if (kind === 'needs') return { tone: 'warn', label: 'paused · needs you', pulse: true }
	if (kind === 'running') return { tone: 'info', label: 'running', pulse: true }
	if (runState === 'failed') return { tone: 'danger', label: 'failed', pulse: false }
	if (runState === 'cancelled') return { tone: 'neutral', label: 'cancelled', pulse: false }
	return { tone: 'success', label: 'shipped', pulse: false }
}

function elapsedFromRun(run: LinkedRunSummary | null, now: number): string | null {
	if (!run) return null
	const start = new Date(run.started_at).getTime()
	if (Number.isNaN(start)) return null
	const ref = run.finished_at ? new Date(run.finished_at).getTime() : now
	return fmtElapsed(run.started_at, ref || now)
}

function MetaSep() {
	return (
		<span className="font-data text-[11px] text-fg-dim" aria-hidden="true">
			·
		</span>
	)
}

export function ExecutionLogHeader({ kind, currentStep, run }: ExecutionLogHeaderProps) {
	const now = useNow()
	const openDrawer = useRunDrawerStore((s) => s.openDrawer)
	const chip = chipFor(kind, run?.state ?? null)
	const elapsed = elapsedFromRun(run, now)
	const agentName = currentStep?.agent_name ?? null
	const modelLabel = currentStep?.model ?? null
	const elapsedSuffix = kind === 'done' ? 'total' : 'elapsed'

	const meta: { key: string; node: ReactNode }[] = []
	if (agentName) {
		meta.push({
			key: 'agent',
			node: (
				<span className="ml-1 inline-flex items-center gap-1.5">
					<span
						className="inline-flex size-3.5 items-center justify-center rounded-full text-white"
						style={{ backgroundColor: agentColor(agentName) }}
						aria-hidden="true"
					>
						<Bot size={8} strokeWidth={2} />
					</span>
					<span className="font-data text-[11.5px] font-medium text-fg">{agentName}</span>
				</span>
			)
		})
	}
	if (modelLabel) {
		meta.push({
			key: 'model',
			node: <span className="font-data text-[11.5px] text-fg-dim">{modelLabel}</span>
		})
	}
	if (elapsed) {
		meta.push({
			key: 'elapsed',
			node: (
				<span className="font-data text-[11px] text-fg-dim">
					{elapsed} {elapsedSuffix}
				</span>
			)
		})
	}

	return (
		<header className="flex flex-wrap items-center gap-2 border-b border-border bg-canvas px-4 py-3">
			<span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg">
				<Zap size={14} strokeWidth={2} className="text-accent" aria-hidden="true" />
				Execution
			</span>
			<ExecStateChip tone={chip.tone} label={chip.label} pulse={chip.pulse} />
			{meta.map((seg, i) => (
				<Fragment key={seg.key}>
					{i > 0 ? <MetaSep /> : null}
					{seg.node}
				</Fragment>
			))}
			{run ? (
				<div className="ml-auto flex items-center gap-2">
					<span className="h-3.5 w-px bg-border" aria-hidden="true" />
					<Btn
						kind="ghost"
						size="sm"
						icon="external"
						onClick={() => openDrawer(run.id, 'activity')}
					>
						Open run
					</Btn>
				</div>
			) : null}
		</header>
	)
}
