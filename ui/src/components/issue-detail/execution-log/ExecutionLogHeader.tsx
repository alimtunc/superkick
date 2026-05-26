import { Fragment, type ReactNode } from 'react'

import { Pill, type PillTone } from '@/components/ui/pill'
import { useNow } from '@/hooks/useNow'
import { fmtElapsed } from '@/lib/domain'
import { useRunDrawerStore } from '@/stores/runDrawer'
import type { LaunchTaskStep, LinkedRunSummary, RunState } from '@/types'
import { Bot, Zap } from 'lucide-react'

type HeaderKind = 'running' | 'needs' | 'done'

interface ExecutionLogHeaderProps {
	kind: HeaderKind
	currentStep: LaunchTaskStep | null
	run: LinkedRunSummary | null
}

interface ChipMeta {
	tone: PillTone
	label: string
	dot: boolean
	pulse: boolean
}

function chipFor(kind: HeaderKind, runState: RunState | null): ChipMeta {
	if (kind === 'needs') return { tone: 'warn', label: 'needs you', dot: true, pulse: true }
	if (kind === 'running') return { tone: 'info', label: 'running', dot: true, pulse: true }
	if (runState === 'failed') return { tone: 'danger', label: 'failed', dot: true, pulse: false }
	if (runState === 'cancelled') return { tone: 'neutral', label: 'cancelled', dot: true, pulse: false }
	return { tone: 'success', label: 'shipped', dot: true, pulse: false }
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
						className="inline-flex size-4 items-center justify-center rounded-full bg-accent-soft text-accent"
						aria-hidden="true"
					>
						<Bot size={10} strokeWidth={2} />
					</span>
					<span className="font-data text-[11.5px] text-fg-muted">{agentName}</span>
				</span>
			)
		})
	}
	if (modelLabel) {
		meta.push({
			key: 'model',
			node: <span className="font-data text-[11.5px] text-fg-muted">{modelLabel}</span>
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
		<header className="flex flex-wrap items-center gap-2">
			<span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-fg">
				<Zap size={12} strokeWidth={2} className="text-accent" aria-hidden="true" />
				Execution
			</span>
			<Pill tone={chip.tone} size="sm" dot={chip.dot} pulse={chip.pulse}>
				{chip.label}
			</Pill>
			{meta.map((seg, i) => (
				<Fragment key={seg.key}>
					{i > 0 ? <MetaSep /> : null}
					{seg.node}
				</Fragment>
			))}
			{run ? (
				<button
					type="button"
					onClick={() => openDrawer(run.id, 'activity')}
					className="font-data ml-auto inline-flex h-7 items-center gap-1 rounded-md border border-transparent px-2 text-[11.5px] text-fg-muted transition-colors hover:bg-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
				>
					Open run →
				</button>
			) : null}
		</header>
	)
}
