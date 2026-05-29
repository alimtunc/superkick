import type { ComponentProps, CSSProperties, ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { cva, type VariantProps } from 'class-variance-authority'

const pillVariants = cva(
	'inline-flex shrink-0 items-center rounded-full border leading-none font-medium whitespace-nowrap transition-colors',
	{
		variants: {
			tone: {
				neutral: 'border-border bg-transparent text-fg-muted',
				accent: 'border-transparent bg-accent-soft text-accent',
				success: 'border-transparent bg-success-soft text-success',
				warn: 'border-transparent bg-warn-soft text-warn',
				danger: 'border-transparent bg-danger-soft text-danger',
				info: 'border-transparent bg-info-soft text-info',
				needs: 'border-transparent bg-[var(--status-needs-soft)] text-[var(--status-needs)]',
				review: 'border-transparent bg-[var(--status-review-soft)] text-[var(--status-review)]'
			},
			size: {
				xs: 'h-[18px] gap-1.5 px-2 py-px text-[11.5px]',
				sm: 'h-6 gap-1.5 px-2 text-[11px]',
				md: 'h-7 gap-1.5 px-2.5 text-xs'
			},
			interactive: {
				true: 'cursor-pointer hover:border-border-strong',
				false: ''
			},
			mono: {
				true: 'font-mono',
				false: ''
			}
		},
		defaultVariants: {
			tone: 'neutral',
			size: 'xs',
			interactive: false,
			mono: false
		}
	}
)

export type PillTone = NonNullable<VariantProps<typeof pillVariants>['tone']>
export type PillSize = NonNullable<VariantProps<typeof pillVariants>['size']>

const DOT_BG: Record<PillTone, string> = {
	neutral: 'bg-fg-dim',
	accent: 'bg-accent',
	success: 'bg-success',
	warn: 'bg-warn',
	danger: 'bg-danger',
	info: 'bg-info',
	needs: 'bg-[var(--status-needs)]',
	review: 'bg-[var(--status-review)]'
}

interface PillProps extends Omit<ComponentProps<'span'>, 'children'>, VariantProps<typeof pillVariants> {
	children?: ReactNode
	leading?: ReactNode
	trailing?: ReactNode
	dot?: boolean
	pulse?: boolean
	style?: CSSProperties
}

export function Pill({
	tone = 'neutral',
	size = 'xs',
	interactive = false,
	mono = false,
	leading,
	trailing,
	dot,
	pulse,
	className,
	children,
	...props
}: PillProps) {
	return (
		<span className={cn(pillVariants({ tone, size, interactive, mono }), className)} {...props}>
			{dot ? (
				<span
					className={cn(
						'inline-block size-1.25 shrink-0 rounded-full',
						DOT_BG[tone ?? 'neutral'],
						pulse ? 'sk-pulse' : null
					)}
				/>
			) : null}
			{leading ? <span className="inline-flex shrink-0 items-center">{leading}</span> : null}
			{children}
			{trailing ? <span className="inline-flex shrink-0 items-center">{trailing}</span> : null}
		</span>
	)
}
