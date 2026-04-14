import { PendingAttentionRequest } from '@/components/run-detail/PendingAttentionRequest'
import { ResolvedAttentionRequest } from '@/components/run-detail/ResolvedAttentionRequest'
import type { AttentionRequest } from '@/types'

interface AttentionRequestPanelProps {
	runId: string
	requests: AttentionRequest[]
	onUpdated: () => void
}

export function AttentionRequestPanel({ runId, requests, onUpdated }: AttentionRequestPanelProps) {
	const pending = requests.filter((r) => r.status === 'pending')
	const resolved = requests.filter((r) => r.status !== 'pending')

	return (
		<div className="space-y-3">
			<p className="font-data text-[11px] text-dim">
				Structured asks for human arbitration — distinct from terminal input. Replies are persisted on
				the run.
			</p>

			{pending.map((request) => (
				<PendingAttentionRequest
					key={request.id}
					runId={runId}
					request={request}
					onUpdated={onUpdated}
				/>
			))}

			{resolved.length > 0 ? (
				<div className="space-y-2">
					<h3 className="font-data text-[10px] tracking-wider text-dim uppercase">History</h3>
					{resolved.map((request) => (
						<ResolvedAttentionRequest key={request.id} request={request} />
					))}
				</div>
			) : null}

			{requests.length === 0 ? (
				<p className="font-data text-sm text-dim">No attention requests.</p>
			) : null}
		</div>
	)
}
