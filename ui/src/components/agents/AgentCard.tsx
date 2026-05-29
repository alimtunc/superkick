import type { SKTone } from '@/types/icons'
import type { AgentIdentity } from '@/ui/Avatar'
import { Avatar } from '@/ui/Avatar'
import { Icon } from '@/ui/Icon'
import { Sparkline } from '@/ui/Sparkline'

interface AgentCardProps {
	id?: string
	name: string
	role: string
	model: string
	runs: number
	success: number
	sparkline: number[]
	tags: string[]
	tone: SKTone
	status: 'active' | 'paused'
}

function agentIdentityOf(model: string): AgentIdentity {
	const m = model.toLowerCase()
	return m.includes('codex') || m.includes('gpt') ? 'codex' : 'claude'
}

export function AgentCard({
	id,
	name,
	role,
	model,
	runs,
	success,
	sparkline,
	tags,
	tone,
	status
}: AgentCardProps) {
	const isActive = status === 'active'
	const successOk = success >= 85

	return (
		<article className="flex flex-col gap-3 rounded-[7px] border border-border bg-raised p-4 shadow-(--shadow-sm)">
			<header className="flex items-center gap-3">
				<Avatar
					id={id ?? name}
					name={name}
					agent={agentIdentityOf(model)}
					state={isActive ? 'running' : undefined}
					size={36}
				/>
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<div className="flex items-center gap-2">
						<span className="text-[14px] font-semibold text-fg">{name}</span>
						<span className="pill pill--neutral">{role}</span>
					</div>
					<span className="mono text-[12px] text-fg-dim">{model}</span>
				</div>
				<span className={`pill ${isActive ? 'pill--success' : 'pill--warn'}`}>
					{isActive ? (
						<span className="agdot agdot--running" />
					) : (
						<Icon name="pause" size={11} className="ic" />
					)}
					{status}
				</span>
			</header>

			<Sparkline tone={tone} data={sparkline} width={260} height={28} />

			<div className="flex gap-8 border-t border-(--border-faint) pt-3">
				<div className="flex flex-col gap-1">
					<span className="stat__k">Runs</span>
					<span className="mono text-[16px] font-semibold text-fg tabular-nums">{runs}</span>
				</div>
				<div className="flex flex-col gap-1">
					<span className="stat__k">Success</span>
					<span
						className={`mono text-[16px] font-semibold tabular-nums ${successOk ? 'text-success' : 'text-warn'}`}
					>
						{success}%
					</span>
				</div>
			</div>

			<div className="flex flex-wrap gap-1.5">
				{tags.map((tag) => (
					<span key={tag} className="pill pill--neutral">
						{tag}
					</span>
				))}
			</div>
		</article>
	)
}
