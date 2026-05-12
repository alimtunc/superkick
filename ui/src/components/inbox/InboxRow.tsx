import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'
import type { SKTone } from '@/types/icons'
import { Dot } from '@/ui/Dot'

interface InboxRowProps {
	tone: SKTone
	title: ReactNode
	sub?: ReactNode
	why?: ReactNode
	ctx?: ReactNode
	age?: ReactNode
	actions?: ReactNode
	/**
	 * Wrap the identity column (dot + title + why + ctx + age) so the row's
	 * primary destination is reachable without nesting interactive elements
	 * inside the `actions` slot. Pass a function that renders its inner
	 * content into a Link / button / anchor — for example, the existing
	 * `InboxActionLink` which adapts to the action's destination kind.
	 */
	wrap?: (inner: ReactNode) => ReactNode
	className?: string
}

export function InboxRow({ tone, title, sub, why, ctx, age, actions, wrap, className }: InboxRowProps) {
	const showFooter = ctx != null || age != null
	const identity = (
		<div className="flex min-w-0 flex-1 items-start gap-3.5">
			<Dot tone={tone} size={8} className="mt-1.75" />
			<div className="flex min-w-0 flex-1 flex-col gap-1.25">
				<div className="flex items-center gap-2">
					<span className="truncate text-[14px] font-semibold text-fg">{title}</span>
					{sub}
				</div>
				{why ? <div className="text-[12.5px] leading-normal text-fg-muted">{why}</div> : null}
				{showFooter ? (
					<div className="mt-0.5 flex items-center gap-2.5 text-[11.5px] text-fg-dim">
						{ctx ? <span className="truncate font-mono">{ctx}</span> : null}
						{ctx && age ? <span className="opacity-50">·</span> : null}
						{age ? <span className="shrink-0">{age}</span> : null}
					</div>
				) : null}
			</div>
		</div>
	)

	return (
		<div
			className={cn(
				'group flex items-start gap-3 border-b border-border px-6 py-3.5 transition-colors last:border-b-0 focus-within:bg-raised hover:bg-raised',
				className
			)}
		>
			{wrap ? wrap(identity) : identity}
			{actions ? <div className="flex shrink-0 items-center gap-1.5 self-center">{actions}</div> : null}
		</div>
	)
}
