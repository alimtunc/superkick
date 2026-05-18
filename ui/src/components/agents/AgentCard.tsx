import { Pill } from '@/components/ui/pill'
import type { SKTone } from '@/types/icons'
import { Avatar } from '@/ui/Avatar'
import { Btn } from '@/ui/Btn'
import { Sparkline } from '@/ui/Sparkline'

interface AgentCardProps {
	name: string
	role: string
	model: string
	runs: number
	success: number
	sparkline: number[]
	tags: string[]
	tone: SKTone
}

export function AgentCard({ name, role, model, runs, success, sparkline, tags, tone }: AgentCardProps) {
	return (
		<article className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
			<header className="flex items-center gap-3">
				<Avatar tone={tone} icon="bot" size={36} />
				<div className="flex flex-1 flex-col gap-0.5">
					<div className="flex items-center gap-2">
						<span className="text-[14.5px] font-semibold text-fg">{name}</span>
						<Pill tone="info" size="xs">
							{role}
						</Pill>
					</div>
					<span className="font-mono text-[11.5px] text-fg-dim">{model}</span>
				</div>
				<Btn kind="ghost" size="sm" icon="more" aria-label="Agent actions" />
			</header>

			<div className="flex items-center gap-3.5 border-y border-border py-2.5 text-[12px]">
				<div className="flex flex-1 flex-col gap-px">
					<span className="text-[11px] text-fg-dim">RUNS · 30d</span>
					<span className="font-mono text-[14px] font-semibold text-fg">{runs}</span>
				</div>
				<div className="flex flex-1 flex-col gap-px">
					<span className="text-[11px] text-fg-dim">SUCCESS</span>
					<div className="flex items-center gap-1.5">
						<span className="font-mono text-[14px] font-semibold text-fg">{success}%</span>
						<Sparkline tone="success" data={sparkline} width={48} height={16} />
					</div>
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-1.5">
				{tags.map((tag) => (
					<Pill key={tag} tone="neutral" size="xs">
						{tag}
					</Pill>
				))}
			</div>
		</article>
	)
}
