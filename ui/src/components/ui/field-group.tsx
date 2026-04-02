import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

export function FieldGroup({ className, ...props }: ComponentProps<'div'>) {
	return (
		<div
			data-slot="field-group"
			className={cn(
				'group/field-group @container/field-group flex w-full flex-col gap-5 data-[slot=checkbox-group]:gap-3 *:data-[slot=field-group]:gap-4',
				className
			)}
			{...props}
		/>
	)
}
