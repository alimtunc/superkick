import { resolveProviderLabel } from '@/lib/domain'
import { cn } from '@/lib/utils'
import type { LaunchStepKind, LaunchTaskStep, LaunchTaskStepStatus } from '@/types'
import { Check, Circle, CircleDot, Hand, Minus, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { LaunchStepLinks } from './LaunchStepLinks'
import { LaunchStepStatusBadge } from './LaunchStepStatusBadge'

const STEP_KIND_LABEL: Record<LaunchStepKind, string> = {
	plan: 'Plan',
	implement: 'Implement',
	review: 'Review'
}

interface StatusIconSpec {
	Icon: LucideIcon
	className: string
	pulse: boolean
}

const STATUS_ICON: Record<LaunchTaskStepStatus, StatusIconSpec> = {
	pending: { Icon: Circle, className: 'text-dim', pulse: false },
	running: { Icon: CircleDot, className: 'text-cyan', pulse: true },
	completed: { Icon: Check, className: 'text-mineral', pulse: false },
	failed: { Icon: X, className: 'text-oxide', pulse: false },
	needs_human: { Icon: Hand, className: 'text-gold', pulse: false },
	skipped: { Icon: Minus, className: 'text-dim', pulse: false },
	cancelled: { Icon: Minus, className: 'text-dim', pulse: false }
}

function agentSubtitle(step: LaunchTaskStep): string {
	const provider = step.provider ? resolveProviderLabel(step.provider) : null
	const parts = [provider, step.model].filter((p): p is string => Boolean(p))
	return parts.join(' · ')
}

interface LaunchStepRowProps {
	step: LaunchTaskStep
	isCurrent: boolean
}

export function LaunchStepRow({ step, isCurrent }: LaunchStepRowProps) {
	const iconSpec = STATUS_ICON[step.status]
	const subtitle = agentSubtitle(step)
	const summary = step.summary?.trim() || null

	return (
		<li
			className={cn(
				'flex flex-col gap-2 rounded-md border px-3 py-3 transition-colors',
				isCurrent ? 'border-mineral/40 bg-mineral/5' : 'border-edge/60 bg-graphite/40'
			)}
		>
			<div className="flex items-center gap-3">
				<iconSpec.Icon
					size={14}
					strokeWidth={1.75}
					className={cn(iconSpec.className, iconSpec.pulse ? 'live-pulse' : null)}
					aria-hidden="true"
				/>
				<span className="font-data text-[12px] font-medium text-fog">
					{STEP_KIND_LABEL[step.step_kind]}
				</span>
				<span className="font-data truncate text-[11px] text-silver">{step.agent_name}</span>
				{subtitle ? (
					<span className="font-data truncate text-[11px] text-dim">{subtitle}</span>
				) : null}
				<span className="ml-auto">
					<LaunchStepStatusBadge status={step.status} />
				</span>
			</div>
			{summary ? <p className="line-clamp-2 pl-6 text-[12px] text-silver">{summary}</p> : null}
			<LaunchStepLinks step={step} />
		</li>
	)
}
