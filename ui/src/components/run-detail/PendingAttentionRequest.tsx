import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAttentionRequestActions } from '@/hooks/useAttentionRequestActions'
import type { AttentionRequest } from '@/types'

export function PendingAttentionRequest({
	runId,
	request,
	onUpdated
}: {
	runId: string
	request: AttentionRequest
	onUpdated: () => void
}) {
	const { submitting, error, reply, cancel } = useAttentionRequestActions(runId, request.id, onUpdated)
	const [text, setText] = useState('')
	const [reason, setReason] = useState('')

	return (
		<div className="panel glow-gold border-l-2 border-l-gold p-4">
			<div className="flex items-start gap-3">
				<span className="font-data mt-0.5 text-base text-gold">?</span>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<span className="font-data rounded bg-gold/15 px-1.5 py-0.5 text-[10px] tracking-wider text-gold uppercase">
							{request.kind}
						</span>
						<p className="text-sm font-medium text-fog">{request.title}</p>
					</div>
					{request.body ? (
						<p className="mt-1 text-[13px] whitespace-pre-wrap text-fog/85">{request.body}</p>
					) : null}
					<p className="font-data mt-1 text-[10px] text-dim">
						{new Date(request.created_at).toLocaleString()}
					</p>

					{error ? (
						<p className="font-data mt-2 rounded bg-oxide-dim p-2 text-[12px] text-oxide">
							{error}
						</p>
					) : null}

					<div className="mt-3">
						{request.kind === 'clarification' ? (
							<div className="flex gap-2">
								<Input
									value={text}
									onChange={(e) => setText(e.target.value)}
									placeholder="Write your reply..."
									className="font-data flex-1 border-edge bg-carbon text-[12px] text-fog placeholder-dim focus:border-edge-bright"
								/>
								<Button
									variant="outline"
									size="xs"
									disabled={submitting || text.trim().length === 0}
									onClick={() => reply({ kind: 'text', text: text.trim() })}
									className="font-data border-mineral/30 bg-mineral-dim text-[11px] text-mineral hover:bg-mineral/20"
								>
									REPLY
								</Button>
							</div>
						) : null}

						{request.kind === 'decision' && request.options ? (
							<div className="flex flex-wrap gap-2">
								{request.options.map((opt) => (
									<Button
										key={opt}
										variant="outline"
										size="xs"
										disabled={submitting}
										onClick={() => reply({ kind: 'choice', choice: opt })}
										className="font-data border-cyan/30 bg-cyan-dim text-[11px] text-cyan hover:bg-cyan/20"
									>
										{opt}
									</Button>
								))}
							</div>
						) : null}

						{request.kind === 'approval' ? (
							<div className="space-y-2">
								<Input
									value={reason}
									onChange={(e) => setReason(e.target.value)}
									placeholder="Optional reason..."
									className="font-data border-edge bg-carbon text-[12px] text-fog placeholder-dim focus:border-edge-bright"
								/>
								<div className="flex gap-2">
									<Button
										variant="outline"
										size="xs"
										disabled={submitting}
										onClick={() =>
											reply({
												kind: 'approval',
												approved: true,
												reason: reason.trim() || undefined
											})
										}
										className="font-data border-mineral/30 bg-mineral-dim text-[11px] text-mineral hover:bg-mineral/20"
									>
										APPROVE
									</Button>
									<Button
										variant="outline"
										size="xs"
										disabled={submitting}
										onClick={() =>
											reply({
												kind: 'approval',
												approved: false,
												reason: reason.trim() || undefined
											})
										}
										className="font-data border-oxide/30 bg-oxide-dim text-[11px] text-oxide hover:bg-oxide/20"
									>
										REJECT
									</Button>
								</div>
							</div>
						) : null}

						<div className="mt-2">
							<Button
								variant="ghost"
								size="xs"
								disabled={submitting}
								onClick={cancel}
								className="font-data text-[10px] text-dim hover:text-fog"
							>
								cancel request
							</Button>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
