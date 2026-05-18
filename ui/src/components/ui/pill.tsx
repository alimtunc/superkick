import type { ComponentProps, CSSProperties, ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { Dot, type DotTone } from '@/ui/Dot'
import { cva, type VariantProps } from 'class-variance-authority'

const pillVariants = cva(
	'font-data inline-flex shrink-0 items-center leading-none whitespace-nowrap transition-colors',
	{
		variants: {
			tone: {
				neutral: 'border border-edge bg-slate-deep/60 text-silver',
				mineral: 'border border-mineral/30 bg-mineral-dim text-mineral',
				oxide: 'border border-oxide/30 bg-oxide-dim text-oxide',
				gold: 'border border-gold/30 bg-gold-dim text-gold',
				cyan: 'border border-cyan/30 bg-cyan-dim text-cyan',
				violet: 'border border-violet/30 bg-violet-dim text-violet',
				live: 'border border-neon-green/30 bg-neon-green/10 text-neon-green',
				accent: 'border border-accent/30 bg-accent-soft text-accent',
				success: 'border border-success/30 bg-success-soft text-success',
				warn: 'border border-warn/30 bg-warn-soft text-warn',
				danger: 'border border-danger/30 bg-danger-soft text-danger',
				info: 'border border-info/30 bg-info-soft text-info'
			},
			size: {
				xs: 'h-5 gap-1 rounded px-1.5 text-[10px]',
				sm: 'h-6 gap-1 rounded-md px-2 text-[11px]',
				md: 'h-7 gap-1.5 rounded-md px-2.5 text-xs'
			},
			shape: {
				default: '',
				round: ''
			},
			interactive: {
				true: 'cursor-pointer hover:border-edge-bright',
				false: ''
			},
			mono: {
				true: 'font-mono',
				false: ''
			}
		},
		compoundVariants: [
			{ shape: 'round', size: 'xs', class: 'rounded-full' },
			{ shape: 'round', size: 'sm', class: 'rounded-full' },
			{ shape: 'round', size: 'md', class: 'rounded-full' }
		],
		defaultVariants: {
			tone: 'neutral',
			size: 'xs',
			shape: 'default',
			interactive: false,
			mono: false
		}
	}
)

export type PillTone = NonNullable<VariantProps<typeof pillVariants>['tone']>
export type PillSize = NonNullable<VariantProps<typeof pillVariants>['size']>

function dotToneFor(tone: PillTone | null | undefined): DotTone {
	switch (tone) {
		case 'accent':
		case 'success':
		case 'warn':
		case 'danger':
		case 'info':
		case 'live':
			return tone
		default:
			return 'neutral'
	}
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
	shape = 'default',
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
		<span className={cn(pillVariants({ tone, size, shape, interactive, mono }), className)} {...props}>
			{dot ? <Dot tone={dotToneFor(tone)} size={6} pulse={pulse} /> : null}
			{leading ? <span className="inline-flex shrink-0 items-center">{leading}</span> : null}
			{children}
			{trailing ? <span className="inline-flex shrink-0 items-center">{trailing}</span> : null}
		</span>
	)
}
