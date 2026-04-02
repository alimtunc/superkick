import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

export function FieldSet({ className, ...props }: ComponentProps<'fieldset'>) {
	return (
		<fieldset
			data-slot="field-set"
			className={cn(
				'flex flex-col gap-4 has-[>[data-slot=checkbox-group]]:gap-3 has-[>[data-slot=radio-group]]:gap-3',
				className
			)}
			{...props}
		/>
	)
}
