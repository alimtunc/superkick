import { Fragment, type ReactNode } from 'react'

interface TopbarProps {
	title: ReactNode
	crumbs?: string[]
	sub?: ReactNode
	right?: ReactNode
	back?: ReactNode
}

export function Topbar({ title, crumbs, sub, right, back }: TopbarProps) {
	const hasCrumbs = crumbs && crumbs.length > 0
	return (
		<div className="flex h-[52px] shrink-0 items-center gap-3.5 border-b border-border bg-surface px-6">
			{back ? <div className="-ml-1 flex shrink-0 items-center">{back}</div> : null}
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				{hasCrumbs ? (
					<div className="flex items-center gap-1.5 text-[11.5px] text-fg-dim">
						{crumbs.map((crumb, index) => {
							const last = index === crumbs.length - 1
							const path = crumbs.slice(0, index + 1).join('/')
							return (
								<Fragment key={path}>
									{index > 0 ? <span className="opacity-50">/</span> : null}
									<span className={last ? 'text-fg-muted' : 'text-fg-dim'}>{crumb}</span>
								</Fragment>
							)
						})}
					</div>
				) : null}
				<div className="flex items-center gap-2.5">
					<span className="truncate text-[15px] font-semibold text-fg">{title}</span>
					{sub}
				</div>
			</div>
			{right ? <div className="flex shrink-0 items-center gap-2">{right}</div> : null}
		</div>
	)
}
