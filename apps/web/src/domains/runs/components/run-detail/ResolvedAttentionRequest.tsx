import { ClientDateTime } from '@/components/primitives'
import type { AttentionRequest } from '@/types'
import { Check, X } from 'lucide-react'

export function ResolvedAttentionRequest({ request }: { request: AttentionRequest }) {
	return (
		<div className="panel border-l-2 border-l-border p-3">
			<div className="flex items-start gap-3">
				<span className="mt-0.5 inline-flex text-fg-dim">
					{request.status === 'replied' ? (
						<Check size={16} strokeWidth={1.75} aria-hidden="true" />
					) : (
						<X size={16} strokeWidth={1.75} aria-hidden="true" />
					)}
				</span>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<span className="font-data rounded bg-border/30 px-1.5 py-0.5 text-[10px] tracking-wider text-fg-dim uppercase">
							{request.kind}
						</span>
						<p className="text-[13px] text-fg/85">{request.title}</p>
					</div>
					{request.reply ? (
						<p className="font-data mt-1 text-[12px] text-fg/70">{replyText(request.reply)}</p>
					) : null}
					<p className="font-data mt-1 text-[10px] text-fg-dim">
						{request.replied_at ? 'replied ' : ''}
						<ClientDateTime value={request.replied_at ?? request.created_at} />
						{request.replied_by ? ` · ${request.replied_by}` : ''}
					</p>
				</div>
			</div>
		</div>
	)
}

function replyText(reply: AttentionRequest['reply']): string {
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
