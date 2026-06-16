import { ExecutionModeBadge, PrStateBadge } from '@/components/badges'
import { ExternalLink } from '@/components/ui/external-link'
import { fmtElapsed, fmtRelativeTime, providerLabel, stepLabel } from '@/lib/domain'
import {
	attentionHint,
	runNarrative,
	summarizeAttention,
	toneDotClass,
	toneTextClass
} from '@/lib/domain/narrative'
import type { AgentSession, AttentionRequest, Interrupt, PullRequest, Run } from '@/types'

interface RunHeroProps {
	run: Run
	pr: PullRequest | null
	sessions: AgentSession[]
	attentionRequests: AttentionRequest[]
	interrupts: Interrupt[]
	refTime: number
}

function activeSession(sessions: AgentSession[]): AgentSession | null {
	return (
		sessions.find((s) => s.status === 'running') ?? sessions.find((s) => s.status === 'starting') ?? null
	)
}

function activeRole(run: Run, sessions: AgentSession[]): string | null {
	const active = activeSession(sessions)
	const stepName = run.current_step_key ? stepLabel[run.current_step_key] : null
	if (active) {
		const provider = providerLabel[active.provider] ?? active.provider
		return stepName ? `${provider} · ${stepName}` : provider
	}
	return stepName
}

function pluralize(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function formatAttention(attention: ReturnType<typeof summarizeAttention>): string {
	const parts: string[] = []
	if (attention.pendingAttention > 0) parts.push(pluralize(attention.pendingAttention, 'request'))
	if (attention.pendingInterrupts > 0) parts.push(pluralize(attention.pendingInterrupts, 'interrupt'))
	return parts.join(' · ')
}

export function RunHero({ run, pr, sessions, attentionRequests, interrupts, refTime }: RunHeroProps) {
	const narrative = runNarrative(run.state)
	const role = activeRole(run, sessions)
	const attention = summarizeAttention(attentionRequests, interrupts)
	const endTime = run.finished_at ? Date.parse(run.finished_at) : refTime
	const elapsed = fmtElapsed(run.started_at, endTime)

	const tone = attention.total > 0 ? 'attention' : narrative.tone
	const headline = attention.total > 0 ? 'Needs your decision' : narrative.headline
	const nextHint = attentionHint(attention.total) ?? narrative.nextHint

	return (
		<section className="space-y-3" aria-label="Run status summary">
			<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-6">
				<div className="min-w-0 flex-1">
					<div className="mb-2 flex items-center gap-2">
						<span className={`inline-block h-2 w-2 rounded-full ${toneDotClass[tone]}`} />
						<span
							className={`font-data text-[11px] font-medium tracking-widest uppercase ${toneTextClass[tone]}`}
						>
							{narrative.phase}
						</span>
						{run.execution_mode ? <ExecutionModeBadge mode={run.execution_mode} /> : null}
						<span className="font-data text-[10px] text-fg-dim">
							· {run.finished_at ? 'ran for' : 'running for'} {elapsed}
						</span>
					</div>

					<h1 className="text-[18px] leading-snug font-semibold text-fg">{headline}</h1>

					<p className="font-data mt-1 text-[12px] text-fg-muted/80">{nextHint}</p>

					{run.error_message ? (
						<p className="font-data mt-3 rounded border border-danger/30 bg-danger-soft px-3 py-2 text-[12px] text-danger">
							{run.error_message}
						</p>
					) : null}
				</div>

				<dl className="flex shrink-0 flex-row gap-5 md:flex-col md:items-end md:gap-2 md:text-right">
					{role ? (
						<div>
							<dt className="font-data text-[10px] tracking-wider text-fg-dim uppercase">
								Active
							</dt>
							<dd className="font-data mt-0.5 text-[12px] text-fg">{role}</dd>
						</div>
					) : null}
					<div>
						<dt className="font-data text-[10px] tracking-wider text-fg-dim uppercase">
							Attention
						</dt>
						<dd className="font-data mt-0.5 text-[12px]">
							{attention.total === 0 ? (
								<span className="text-fg-dim">None</span>
							) : (
								<span className="text-warn">{formatAttention(attention)}</span>
							)}
						</dd>
					</div>
					{pr ? (
						<div>
							<dt className="font-data text-[10px] tracking-wider text-fg-dim uppercase">
								Pull request
							</dt>
							<dd className="font-data mt-0.5 flex items-center gap-1.5 text-[12px]">
								<ExternalLink href={pr.url} className="text-success hover:text-success/80">
									#{pr.number}
								</ExternalLink>
								<PrStateBadge state={pr.state} />
							</dd>
						</div>
					) : null}
					{run.finished_at ? (
						<div>
							<dt className="font-data text-[10px] tracking-wider text-fg-dim uppercase">
								Finished
							</dt>
							<dd className="font-data mt-0.5 text-[12px] text-fg-muted/80">
								{fmtRelativeTime(run.finished_at)}
							</dd>
						</div>
					) : null}
				</dl>
			</div>
		</section>
	)
}
