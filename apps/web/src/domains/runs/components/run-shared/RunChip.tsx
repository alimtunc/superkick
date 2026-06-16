import { Icon } from '@/components/primitives'
import { runStateLabel } from '@/lib/domain/displayLabels'
import type { RunState } from '@/types'
import type { TaskBadgeKind } from '@/types/lifecycle'

export type RunChipVariant = 'running' | 'needs' | 'done' | 'failed'

const STATE_VARIANT: Record<RunState, RunChipVariant> = {
	queued: 'running',
	preparing: 'running',
	planning: 'running',
	coding: 'running',
	running_commands: 'running',
	reviewing: 'running',
	opening_pr: 'running',
	waiting_human: 'needs',
	completed: 'done',
	failed: 'failed',
	cancelled: 'failed'
}

const VARIANT_DOT: Record<RunChipVariant, TaskBadgeKind> = {
	running: 'running',
	needs: 'needs',
	done: 'shipped',
	failed: 'needs'
}

type RunChipProps =
	| { state: RunState; glyph?: 'dot' | 'icon' }
	| { variant: RunChipVariant; label: string; glyph?: 'dot' | 'icon' }

function isStateForm(props: RunChipProps): props is { state: RunState; glyph?: 'dot' | 'icon' } {
	return 'state' in props
}

function RunChipGlyph({ variant, glyph }: { variant: RunChipVariant; glyph: 'dot' | 'icon' }) {
	if (glyph === 'icon' && variant !== 'running') {
		return <Icon name={variant === 'done' ? 'check' : 'alert'} size={13} className="ic" />
	}
	return <span className={`agdot agdot--${VARIANT_DOT[variant]}`} aria-hidden="true" />
}

export function RunChip(props: RunChipProps) {
	const glyph = props.glyph ?? 'dot'
	const variant = isStateForm(props) ? STATE_VARIANT[props.state] : props.variant
	const label = isStateForm(props) ? runStateLabel[props.state] : props.label
	return (
		<span className={`runchip runchip--${variant}`}>
			<RunChipGlyph variant={variant} glyph={glyph} />
			{label}
		</span>
	)
}
