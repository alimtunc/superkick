import { activityPayload, type ActivityPayload } from '@/components/run-tabs/structuredActivity'
import { Pill } from '@/components/ui/pill'
import { fmtDuration } from '@/lib/domain'
import { cn } from '@/lib/utils'
import type { RunEvent } from '@/types'
import type { SKIconName } from '@/types/icons'
import { Icon } from '@/ui/Icon'

function nodeToneClass(event: RunEvent, payload: ActivityPayload): string {
	if (event.level === 'error' || payload.status === 'fail') return 'warn'
	if (payload.status === 'green') return 'success'
	if (payload.status === 'running') return 'accent'
	return ''
}

function iconFor(payload: ActivityPayload): SKIconName {
	switch (payload.activity_kind) {
		case 'diff':
		case 'write':
			return 'doc'
		case 'search':
			return 'search'
		case 'summary':
			return 'check'
		case 'test':
			return 'check'
		default:
			return 'spark'
	}
}

function diffLineClass(line: string): string {
	if (line.startsWith('+')) return 'c-success'
	if (line.startsWith('-')) return 'c-danger'
	return 'c-fg'
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
		<span className="filerow__stat ml-auto shrink-0">
			<span className="add">+{added}</span>
			<span className="del">−{removed}</span>
		</span>
	)
}

function TestOutput({ tests }: { tests?: ActivityPayload['tests'] }) {
	if (!tests || tests.length === 0) return null
	return (
		<div className="terminal mt-2">
			{tests.map((test) => (
				<div key={test.name} className="grid grid-cols-[42px_1fr_auto] gap-3">
					<span className="c-accent">RUN</span>
					<span className="c-fg truncate">{test.name}</span>
					<span className={test.result === 'fail' ? 'c-danger' : 'c-success'}>{test.result}</span>
				</div>
			))}
		</div>
	)
}

function DiffBlock({ payload }: { payload: ActivityPayload }) {
	if (!payload.snippet || payload.snippet.length === 0) return null
	return (
		<div className="toolcall mt-2">
			{payload.file ? (
				<div className="toolcall__head">
					<Icon name="doc" size={13} className="ic text-fg-dim" />
					<span className="toolcall__name">{payload.file}</span>
				</div>
			) : null}
			<pre className="toolcall__body">
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
		<ol className={cn('feed', className)}>
			{rows.map(({ event, payload }) => {
				const elapsedMs = Math.max(0, new Date(event.ts).getTime() - baseTs)
				const tone = nodeToneClass(event, payload)
				return (
					<li key={event.id} className="feeditem">
						<span className="feeditem__node">
							<span className={`node-glyph ${tone}`}>
								<Icon name={iconFor(payload)} size={13} className="ic" />
							</span>
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
