import { Pill } from '@/components/ui/pill'
import { TabEmptyState } from '@/components/ui/state-empty-tab'
import { LAUNCH_STEP_KIND_LABEL, LAUNCH_STEP_STATUS_LABEL, LAUNCH_STEP_STATUS_TONE } from '@/lib/domain'
import type { LaunchTaskStep } from '@/types'
import { Link } from '@tanstack/react-router'
import { FileDiff, ScrollText, Terminal } from 'lucide-react'

import { uniqueChangedFiles } from './changedFiles'
import type { TaskCockpitTabId } from './TaskCockpitTabs'

interface TaskCockpitTabPanelProps {
	tab: Exclude<TaskCockpitTabId, 'activity'>
	steps: readonly LaunchTaskStep[]
	linkedRunId: string | null
}

function StepBadge({ step }: { step: LaunchTaskStep }) {
	return (
		<div className="flex items-center gap-2">
			<span className="text-[12px] text-fg-muted">{LAUNCH_STEP_KIND_LABEL[step.step_kind]}</span>
			<Pill tone={LAUNCH_STEP_STATUS_TONE[step.status]} size="xs" dot={step.status === 'running'}>
				{LAUNCH_STEP_STATUS_LABEL[step.status]}
			</Pill>
		</div>
	)
}

function FilesPanel({ steps }: { steps: readonly LaunchTaskStep[] }) {
	const files = uniqueChangedFiles(steps)
	if (files.length === 0) return <TabEmptyState icon={FileDiff} title="No changed files captured yet" />

	return (
		<div className="divide-y divide-border">
			{files.map((file) => (
				<div key={file} className="px-6 py-3 font-mono text-[12px] text-fg">
					{file}
				</div>
			))}
		</div>
	)
}

function StepSummariesPanel({ steps }: { steps: readonly LaunchTaskStep[] }) {
	const rows = steps.filter(
		(step) => step.summary || step.structured_result?.summary || step.failure_classification
	)
	if (rows.length === 0) return <TabEmptyState icon={ScrollText} title="No step summaries yet." />

	return (
		<div className="divide-y divide-border">
			{rows.map((step) => (
				<div key={step.id} className="px-6 py-4">
					<StepBadge step={step} />
					<pre className="bg-ink mt-3 rounded border border-border px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-fg-muted">
						{step.structured_result?.summary ??
							step.summary ??
							JSON.stringify(step.failure_classification)}
					</pre>
				</div>
			))}
		</div>
	)
}

function TerminalPanel({ linkedRunId }: { linkedRunId: string | null }) {
	if (!linkedRunId) return <TabEmptyState icon={Terminal} title="No linked run terminal yet" />

	return (
		<div className="p-6">
			<Link
				to="/runs/$runId"
				params={{ runId: linkedRunId }}
				hash="terminal"
				className="inline-flex h-9 items-center rounded border border-border px-3 font-mono text-[12px] text-fg hover:border-border-strong"
			>
				Open {linkedRunId} terminal
			</Link>
		</div>
	)
}

export function TaskCockpitTabPanel({ tab, steps, linkedRunId }: TaskCockpitTabPanelProps) {
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
			{tab === 'files' ? <FilesPanel steps={steps} /> : null}
			{tab === 'logs' ? <StepSummariesPanel steps={steps} /> : null}
			{tab === 'terminal' ? <TerminalPanel linkedRunId={linkedRunId} /> : null}
		</div>
	)
}
