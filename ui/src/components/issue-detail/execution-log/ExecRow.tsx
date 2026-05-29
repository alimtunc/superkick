import { cn } from '@/lib/utils'
import type { ExecActivityKind, ExecActivityRow } from '@/types'
import type { SKIconName } from '@/types/icons'
import { Icon } from '@/ui'

interface ExecRowPalette {
	icon: SKIconName
	color: string
	soft: string
}

const PALETTE: Record<ExecActivityKind, ExecRowPalette> = {
	plan: { icon: 'layers', color: 'var(--color-fg-muted)', soft: 'var(--color-fg-muted)' },
	search: { icon: 'search', color: 'var(--color-fg-dim)', soft: 'var(--color-fg-dim)' },
	tool: { icon: 'terminal', color: 'var(--color-info)', soft: 'var(--color-info)' },
	edit: { icon: 'doc', color: 'var(--color-accent)', soft: 'var(--color-accent)' },
	test: { icon: 'check', color: 'var(--color-success)', soft: 'var(--color-success)' },
	pr: { icon: 'pr', color: 'var(--color-success)', soft: 'var(--color-success)' },
	ask: { icon: 'comment', color: 'var(--color-warn)', soft: 'var(--color-warn)' },
	stuck: { icon: 'alert', color: 'var(--color-warn)', soft: 'var(--color-warn)' },
	note: { icon: 'clock', color: 'var(--color-fg-dim)', soft: 'var(--color-fg-dim)' },
	done: { icon: 'check', color: 'var(--color-success)', soft: 'var(--color-success)' }
}

interface ExecRowProps {
	row: ExecActivityRow
}

export function ExecRow({ row }: ExecRowProps) {
	const palette = PALETTE[row.kind]

	return (
		<div className="flex min-h-6 items-center gap-2.5">
			<span
				className={cn(
					'relative inline-flex size-[14px] shrink-0 items-center justify-center rounded-full border-[1.5px]',
					row.active ? 'sk-pulse motion-reduce:animate-none' : null
				)}
				style={{
					borderColor: palette.color,
					color: palette.color,
					backgroundColor: row.active
						? `color-mix(in srgb, ${palette.soft} 22%, transparent)`
						: 'transparent',
					boxShadow: row.active
						? `0 0 0 3px color-mix(in srgb, ${palette.soft} 18%, transparent)`
						: undefined
				}}
				aria-hidden="true"
			>
				<Icon name={palette.icon} size={7} strokeWidth={2} />
			</span>
			<span
				className={cn(
					'min-w-0 flex-1 truncate text-[12.5px]',
					row.active ? 'font-medium text-fg' : 'text-fg-muted'
				)}
			>
				{row.title}
			</span>
			{row.meta ? (
				<span className="font-data min-w-[50px] shrink-0 text-right text-[11px] text-fg-dim">
					{row.meta}
				</span>
			) : null}
		</div>
	)
}
