import { activityPayload, type ActivityPayload } from '@/components/run-tabs/structuredActivity'
import { Pill } from '@/components/ui/pill'
import { fmtDuration } from '@/lib/domain'
import type { RunEvent } from '@/types'
import { Check, CircleDot, FileText, Search, TestTube2 } from 'lucide-react'

function toneFor(event: RunEvent, payload: ActivityPayload): string {
	if (event.level === 'error' || payload.status === 'fail') return 'border-oxide/50 text-oxide'
	if (payload.status === 'green') return 'border-success/50 text-success'
	if (payload.status === 'running') return 'border-accent/50 text-accent'
	return 'border-edge text-fg-muted'
}

function IconFor({ payload }: { payload: ActivityPayload }) {
	const common = { size: 13, strokeWidth: 1.85, 'aria-hidden': true }
	switch (payload.activity_kind) {
		case 'diff':
		case 'write':
			return <FileText {...common} />
		case 'search':
			return <Search {...common} />
		case 'summary':
			return <Check {...common} />
		case 'test':
			return <TestTube2 {...common} />
		case 'progress':
		case 'spec':
		default:
			return <CircleDot {...common} />
	}
}

function diffLineClass(line: string): string | undefined {
	if (line.startsWith('+')) return 'text-success'
	if (line.startsWith('-')) return 'text-fg'
	return undefined
}

function StatusBadge({ payload }: { payload: ActivityPayload }) {
	if (!payload.badge && !payload.status) return null
	const label = payload.badge ?? payload.status
	if (payload.status === 'fail') {
		return (
			<Pill mono size="xs" tone="danger">
				{label}
			</Pill>
		)
	}
	if (payload.status === 'green') {
		return (
			<Pill mono size="xs" tone="success">
				{label}
			</Pill>
		)
	}
	if (payload.status === 'running') {
		return (
			<Pill mono size="xs" tone="info" dot>
				{label}
			</Pill>
		)
	}
	return (
		<Pill mono size="xs" tone="neutral">
			{label}
		</Pill>
	)
}

function Delta({ changed }: { changed?: ActivityPayload['changed'] }) {
	if (!changed) return null
	const added = changed.added ?? 0
	const removed = changed.removed ?? 0
	return (
		<span className="font-data ml-auto shrink-0 text-[11px]">
			<span className="text-success">+{added}</span>
			<span className="px-1 text-fg-dim">-</span>
			<span className={removed > 0 ? 'text-oxide' : 'text-fg-dim'}>{removed}</span>
		</span>
	)
}

function TestOutput({ tests }: { tests?: ActivityPayload['tests'] }) {
	if (!tests || tests.length === 0) return null
	return (
		<div className="bg-ink mt-2 rounded border border-edge px-3 py-2 font-mono text-[11px] leading-relaxed">
			{tests.map((test) => (
				<div key={test.name} className="grid grid-cols-[42px_1fr_auto] gap-3 text-fg-muted">
					<span className="text-fg">RUN</span>
					<span className="truncate">{test.name}</span>
					<span className={test.result === 'fail' ? 'text-oxide' : 'text-fg'}>{test.result}</span>
				</div>
			))}
		</div>
	)
}

function DiffBlock({ payload }: { payload: ActivityPayload }) {
	if (!payload.snippet || payload.snippet.length === 0) return null
	return (
		<div className="bg-ink mt-2 overflow-hidden rounded border border-edge">
			{payload.file ? (
				<div className="font-data flex items-center justify-between border-b border-edge px-3 py-2 text-[11px] text-fg-dim">
					<span className="truncate">{payload.file}</span>
				</div>
			) : null}
			<pre className="px-3 py-2 font-mono text-[11px] leading-relaxed text-fg-muted">
				{payload.snippet.map((line) => (
					<div key={line} className={diffLineClass(line)}>
						{line}
					</div>
				))}
			</pre>
		</div>
	)
}

interface StructuredActivityListProps {
	events: readonly RunEvent[]
	className?: string
}

export function StructuredActivityList({ events, className }: StructuredActivityListProps) {
	const rows = events
		.map((event) => ({ event, payload: activityPayload(event) }))
		.filter((row): row is { event: RunEvent; payload: ActivityPayload } => row.payload !== null)
	const baseTs = rows[0] ? new Date(rows[0].event.ts).getTime() : 0

	return (
		<ol className={className}>
			{rows.map(({ event, payload }, index) => {
				const elapsedMs = Math.max(0, new Date(event.ts).getTime() - baseTs)
				return (
					<li key={event.id} className="relative pb-3 pl-7 last:pb-0">
						{index < rows.length - 1 ? (
							<span
								className="absolute top-6 bottom-0 left-[9px] w-px bg-edge"
								aria-hidden="true"
							/>
						) : null}
						<span
							className={`absolute top-1 left-0 flex size-[18px] items-center justify-center rounded-full border bg-carbon ${toneFor(
								event,
								payload
							)}`}
							aria-hidden="true"
						>
							<IconFor payload={payload} />
						</span>
						<div className="flex min-w-0 items-center gap-2">
							<span className="truncate text-[13px] font-medium text-fg">{event.message}</span>
							<StatusBadge payload={payload} />
							<Delta changed={payload.changed} />
							<span className="font-data ml-auto shrink-0 text-[10.5px] text-fg-dim">
								{fmtDuration(elapsedMs)}
							</span>
						</div>
						{payload.detail ? (
							<p className="mt-1 text-[12px] text-fg-muted">
								{payload.detail}
								{payload.file ? (
									<>
										{' '}
										<span className="font-mono font-semibold text-fg">
											{payload.file}
										</span>
									</>
								) : null}
							</p>
						) : null}
						<TestOutput tests={payload.tests} />
						<DiffBlock payload={payload} />
					</li>
				)
			})}
		</ol>
	)
}
