import type { ComponentProps, CSSProperties, ReactNode } from 'react'

import { cn } from '@/lib/utils'
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
				live: 'border border-neon-green/30 bg-neon-green/10 text-neon-green'
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
			interactive: false
		}
	}
)

interface PillProps extends Omit<ComponentProps<'span'>, 'children'>, VariantProps<typeof pillVariants> {
	children?: ReactNode
	leading?: ReactNode
	trailing?: ReactNode
	style?: CSSProperties
}

export function Pill({
	tone = 'neutral',
	size = 'xs',
	shape = 'default',
	interactive = false,
	leading,
	trailing,
	className,
	children,
	...props
}: PillProps) {
	return (
		<span className={cn(pillVariants({ tone, size, shape, interactive }), className)} {...props}>
			{leading ? <span className="inline-flex shrink-0 items-center">{leading}</span> : null}
			{children}
			{trailing ? <span className="inline-flex shrink-0 items-center">{trailing}</span> : null}
		</span>
	)
}

export type PillTone = NonNullable<VariantProps<typeof pillVariants>['tone']>
export type PillSize = NonNullable<VariantProps<typeof pillVariants>['size']>
