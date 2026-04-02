import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

export function FieldLegend({
	className,
	variant = 'legend',
	...props
}: ComponentProps<'legend'> & { variant?: 'legend' | 'label' }) {
	return (
		<legend
			data-slot="field-legend"
			data-variant={variant}
			className={cn(
				'mb-1.5 font-medium data-[variant=label]:text-sm data-[variant=legend]:text-base',
				className
			)}
			{...props}
		/>
	)
}
