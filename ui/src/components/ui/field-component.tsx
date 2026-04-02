import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'
import type { VariantProps } from 'class-variance-authority'

import { fieldVariants } from './field-variants'

export function Field({
	className,
	orientation = 'vertical',
	...props
}: ComponentProps<'div'> & VariantProps<typeof fieldVariants>) {
	return (
		<div
			role="group"
			data-slot="field"
			data-orientation={orientation}
			className={cn(fieldVariants({ orientation }), className)}
			{...props}
		/>
	)
}
