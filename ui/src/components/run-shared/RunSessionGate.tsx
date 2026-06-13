import type { ReactNode } from 'react'

import { ErrorState } from '@/components/ui/state-error'
import { LoadingState } from '@/components/ui/state-loading'
import type { UseRunSessionReturn } from '@/hooks/useRunSession'

type LoadedRunSession = UseRunSessionReturn & { run: NonNullable<UseRunSessionReturn['run']> }

interface RunSessionGateProps {
	session: UseRunSessionReturn
	errorTitle: string
	notFoundMessage: string
	className?: string
	children: (session: LoadedRunSession) => ReactNode
}

export function RunSessionGate({
	session,
	errorTitle,
	notFoundMessage,
	className = 'px-4 py-6',
	children
}: RunSessionGateProps) {
	if (session.loading) {
		return (
			<div className={className}>
				<LoadingState rows={4} />
			</div>
		)
	}

	if (session.error) {
		return (
			<div className={className}>
				<ErrorState title={errorTitle} message={session.error} onRetry={() => session.refresh()} />
			</div>
		)
	}

	if (!session.run) {
		return (
			<div className={className}>
				<ErrorState title="Run not found" message={notFoundMessage} />
			</div>
		)
	}

	return children(session as LoadedRunSession)
}
