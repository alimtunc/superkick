import { Fragment, type ReactNode } from 'react'

import { SidebarTrigger } from '@/components/ui/sidebar'
import type { SKIconName } from '@/types/icons'
import { Icon } from '@/ui/Icon'

interface TopbarProps {
	title: ReactNode
	icon?: SKIconName
	crumbs?: string[]
	sub?: ReactNode
	right?: ReactNode
	back?: ReactNode
}

const IDENTIFIER = /^[A-Z][A-Z0-9]*-\d+$/

export function Topbar({ title, icon, crumbs, sub, right, back }: TopbarProps) {
	const hasCrumbs = crumbs && crumbs.length > 0
	return (
		<div className="topbar">
			<SidebarTrigger className="-ml-1.5" />
			{back ? <div className="-ml-1 flex shrink-0 items-center">{back}</div> : null}
			<div className="crumbs">
				{icon && !hasCrumbs ? <Icon name={icon} size={15} className="shrink-0 text-fg-dim" /> : null}
				{hasCrumbs
					? crumbs.map((crumb) => (
							<Fragment key={crumb}>
								<span className={IDENTIFIER.test(crumb) ? 'mono' : undefined}>{crumb}</span>
								<span className="sep">/</span>
							</Fragment>
						))
					: null}
				<span className="cur truncate">{title}</span>
				{sub}
			</div>
			{right ? <div className="topbar__actions">{right}</div> : null}
		</div>
	)
}
