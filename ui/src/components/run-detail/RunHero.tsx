import { ExecutionModeBadge } from '@/components/ExecutionModeBadge'
import { PrStateBadge } from '@/components/PrStateBadge'
import { RunDetailsGrid } from '@/components/run-detail/RunDetailsGrid'
import { fmtElapsed, fmtRelativeTime, providerLabel, stepLabel } from '@/lib/domain'
import {
	attentionHint,
	runNarrative,
	summarizeAttention,
	toneAccentClass,
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

export function RunHero({ run, pr, sessions, attentionRequests, interrupts, refTime }: RunHeroProps) {
	const narrative = runNarrative(run.state)
	const role = activeRole(run, sessions)
	const attention = summarizeAttention(attentionRequests, interrupts)
	const elapsed = fmtElapsed(run.started_at, refTime)

	const tone = attention.total > 0 ? 'attention' : narrative.tone
	const headline = attention.total > 0 ? 'Needs your decision' : narrative.headline
	const nextHint = attentionHint(attention.total) ?? narrative.nextHint

	return (
		<section
			className={`mb-6 overflow-hidden rounded-lg border ${toneAccentClass[tone]}`}
			aria-label="Run status summary"
		>
			<div className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-start md:justify-between md:gap-6">
				<div className="min-w-0 flex-1">
					<div className="mb-2 flex items-center gap-2">
						<span className={`inline-block h-2 w-2 rounded-full ${toneDotClass[tone]}`} />
						<span
							className={`font-data text-[11px] font-medium tracking-widest uppercase ${toneTextClass[tone]}`}
						>
							{narrative.phase}
						</span>
						{run.execution_mode ? <ExecutionModeBadge mode={run.execution_mode} /> : null}
						<span className="font-data text-[10px] text-dim">· running for {elapsed}</span>
					</div>

					<h1 className="text-[18px] leading-snug font-semibold text-fog">{headline}</h1>

					<p className="font-data mt-1 text-[12px] text-silver/80">{nextHint}</p>

					{run.error_message ? (
						<p className="font-data mt-3 rounded border border-oxide/30 bg-oxide/5 px-3 py-2 text-[12px] text-oxide">
							{run.error_message}
						</p>
					) : null}
				</div>

				<dl className="flex shrink-0 flex-row gap-5 md:flex-col md:items-end md:gap-2 md:text-right">
					{role ? (
						<div>
							<dt className="font-data text-[10px] tracking-wider text-dim uppercase">
								Active
							</dt>
							<dd className="font-data mt-0.5 text-[12px] text-fog">{role}</dd>
						</div>
					) : null}
					<div>
						<dt className="font-data text-[10px] tracking-wider text-dim uppercase">Attention</dt>
						<dd className="font-data mt-0.5 text-[12px]">
							{attention.total === 0 ? (
								<span className="text-dim">None</span>
							) : (
								<span className="text-gold">
									{attention.pendingAttention > 0
										? `${attention.pendingAttention} request${attention.pendingAttention === 1 ? '' : 's'}`
										: null}
									{attention.pendingAttention > 0 && attention.pendingInterrupts > 0
										? ' · '
										: null}
									{attention.pendingInterrupts > 0
										? `${attention.pendingInterrupts} interrupt${attention.pendingInterrupts === 1 ? '' : 's'}`
										: null}
								</span>
							)}
						</dd>
					</div>
					{pr ? (
						<div>
							<dt className="font-data text-[10px] tracking-wider text-dim uppercase">
								Pull request
							</dt>
							<dd className="font-data mt-0.5 flex items-center gap-1.5 text-[12px]">
								<a
									href={pr.url}
									target="_blank"
									rel="noopener noreferrer"
									className="text-neon-green hover:text-neon-green/80"
								>
									#{pr.number}
								</a>
								<PrStateBadge state={pr.state} />
							</dd>
						</div>
					) : null}
					{run.finished_at ? (
						<div>
							<dt className="font-data text-[10px] tracking-wider text-dim uppercase">
								Finished
							</dt>
							<dd className="font-data mt-0.5 text-[12px] text-silver/80">
								{fmtRelativeTime(run.finished_at)}
							</dd>
						</div>
					) : null}
				</dl>
			</div>

			<div className="border-t border-edge/50 bg-carbon/40 px-5 py-2.5">
				<RunDetailsGrid run={run} pr={pr} />
			</div>
		</section>
	)
}
