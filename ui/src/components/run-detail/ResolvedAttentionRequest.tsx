import type { AttentionRequest } from '@/types'

export function ResolvedAttentionRequest({ request }: { request: AttentionRequest }) {
	return (
		<div className="panel border-l-2 border-l-edge p-3">
			<div className="flex items-start gap-3">
				<span className="font-data mt-0.5 text-base text-dim">
					{request.status === 'replied' ? '✓' : '×'}
				</span>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<span className="font-data rounded bg-edge/30 px-1.5 py-0.5 text-[10px] tracking-wider text-dim uppercase">
							{request.kind}
						</span>
						<p className="text-[13px] text-fog/85">{request.title}</p>
					</div>
					{request.reply ? (
						<p className="font-data mt-1 text-[12px] text-fog/70">{renderReply(request.reply)}</p>
					) : null}
					<p className="font-data mt-1 text-[10px] text-dim">
						{request.replied_at
							? `replied ${new Date(request.replied_at).toLocaleString()}`
							: new Date(request.created_at).toLocaleString()}
						{request.replied_by ? ` · ${request.replied_by}` : ''}
					</p>
				</div>
			</div>
		</div>
	)
}

function renderReply(reply: AttentionRequest['reply']): string {
	if (!reply) return ''
	switch (reply.kind) {
		case 'text':
			return `"${reply.text}"`
		case 'choice':
			return `→ ${reply.choice}`
		case 'approval':
			return `${reply.approved ? 'approved' : 'rejected'}${reply.reason ? ` — ${reply.reason}` : ''}`
	}
}
