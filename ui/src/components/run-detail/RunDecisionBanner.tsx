import { SectionTitle } from '@/components/dashboard/SectionTitle'
import { AttentionRequestPanel } from '@/components/run-detail/AttentionRequestPanel'
import { InterruptPanel } from '@/components/run-detail/InterruptPanel'
import { RaiseAttentionRequestForm } from '@/components/run-detail/RaiseAttentionRequestForm'
import type { AttentionRequest, Interrupt } from '@/types'

interface RunDecisionBannerProps {
	runId: string
	attentionRequests: AttentionRequest[]
	interrupts: Interrupt[]
	showInterrupts: boolean
	isTerminal: boolean
	onSync: () => void
}

function attentionSectionTitle(hasPending: boolean, total: number): string {
	if (hasPending) return 'Needs your decision'
	if (total > 0) return 'Attention history'
	return 'Raise an attention request'
}

export function RunDecisionBanner({
	runId,
	attentionRequests,
	interrupts,
	showInterrupts,
	isTerminal,
	onSync
}: RunDecisionBannerProps) {
	const hasPendingAttention = attentionRequests.some((r) => r.status === 'pending')
	const showAttentionBlock = attentionRequests.length > 0 || !isTerminal
	const attentionAccent = hasPendingAttention ? 'gold' : undefined
	const attentionTitle = attentionSectionTitle(hasPendingAttention, attentionRequests.length)

	if (!showInterrupts && !showAttentionBlock) return null

	return (
		<div className="space-y-5 rounded-md border border-edge bg-graphite/60 p-4">
			{showInterrupts ? (
				<section>
					<SectionTitle title="Interrupts" accent="gold" />
					<InterruptPanel runId={runId} interrupts={interrupts} onAnswered={onSync} />
				</section>
			) : null}

			{showAttentionBlock ? (
				<section>
					<SectionTitle title={attentionTitle} accent={attentionAccent} />
					{attentionRequests.length > 0 ? (
						<AttentionRequestPanel
							runId={runId}
							requests={attentionRequests}
							onUpdated={onSync}
						/>
					) : null}
					{!isTerminal ? (
						<div className="mt-3">
							<RaiseAttentionRequestForm runId={runId} onCreated={onSync} />
						</div>
					) : null}
				</section>
			) : null}
		</div>
	)
}
