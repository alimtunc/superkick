import type { ExecActivity, ExecRowKind } from '@/types'
import { Dot, type DotTone } from '@/ui/Dot'

interface ExecActivityRowProps {
	activity: ExecActivity
}

const KIND_TONE: Record<ExecRowKind, DotTone> = {
	plan: 'info',
	edit: 'accent',
	test: 'info',
	ask: 'warn',
	stuck: 'danger',
	done: 'success'
}

const KIND_LABEL: Record<ExecRowKind, string> = {
	plan: 'Plan',
	edit: 'Edit',
	test: 'Test',
	ask: 'Ask',
	stuck: 'Stuck',
	done: 'Done'
}

export function ExecActivityRow({ activity }: ExecActivityRowProps) {
	return (
		<div className="flex items-center gap-2 py-1.5">
			<Dot tone={KIND_TONE[activity.kind]} size={6} />
			<span className="font-data text-[10.5px] text-fg-dim uppercase">{KIND_LABEL[activity.kind]}</span>
			<span className="min-w-0 flex-1 truncate text-[12.5px] text-fg">{activity.title}</span>
			{activity.meta ? (
				<span className="font-data text-[11px] text-fg-dim">{activity.meta}</span>
			) : null}
		</div>
	)
}
