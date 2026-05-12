import { Fragment, type ReactNode } from 'react'

interface TopbarProps {
	title: ReactNode
	crumbs?: string[]
	sub?: ReactNode
	right?: ReactNode
}

export function Topbar({ title, crumbs, sub, right }: TopbarProps) {
	const hasCrumbs = crumbs && crumbs.length > 0
	return (
		<div className="flex h-[52px] shrink-0 items-center gap-3.5 border-b border-border bg-surface px-6">
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				{hasCrumbs ? (
					<div className="flex items-center gap-1.5 text-[11.5px] text-fg-dim">
						{crumbs.map((crumb, index) => {
							const last = index === crumbs.length - 1
							return (
								<Fragment key={crumb}>
									{index > 0 ? <span className="opacity-50">/</span> : null}
									<span className={last ? 'text-fg-muted' : 'text-fg-dim'}>{crumb}</span>
								</Fragment>
							)
						})}
					</div>
				) : null}
				<div className="flex items-center gap-2.5">
					<span className="text-[15px] font-semibold text-fg">{title}</span>
					{sub}
				</div>
			</div>
			{right ? <div className="flex shrink-0 items-center gap-2">{right}</div> : null}
		</div>
	)
}
