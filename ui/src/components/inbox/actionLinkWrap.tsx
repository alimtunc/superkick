import type { ReactNode } from 'react'

import { InboxActionLink } from '@/components/inbox/InboxActionLink'
import { inboxActionAriaLabel } from '@/lib/inbox/actions'
import type { InboxAction } from '@/types'

export function actionLinkWrap(action: InboxAction, identifier: string) {
	return (inner: ReactNode) => (
		<InboxActionLink
			action={action}
			ariaLabel={inboxActionAriaLabel(action, identifier)}
			className="flex min-w-0 flex-1 items-start"
		>
			{inner}
		</InboxActionLink>
	)
}
