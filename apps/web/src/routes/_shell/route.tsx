import { ErrorState } from '@/components/primitives'
import { ChunkLoadErrorPanel } from '@/domains/diff/components/ChunkLoadErrorPanel'
import { isChunkLoadError } from '@/domains/diff/components/isChunkLoadError'
import { errorMessageOr } from '@/lib/errors'
import { AppShell } from '@/shell/AppShell'
import { createRoute, type ErrorComponentProps } from '@tanstack/react-router'

import { Route as rootRoute } from '../__root'

function ShellErrorComponent({ error }: ErrorComponentProps) {
	if (isChunkLoadError(error)) return <ChunkLoadErrorPanel />

	return (
		<div className="flex h-full min-h-0 flex-1 items-center justify-center px-6 py-12">
			<ErrorState
				title="Something went wrong"
				message={errorMessageOr(error, 'This view failed to load.')}
				onRetry={() => window.location.reload()}
				retryLabel="Reload"
				className="w-full max-w-sm"
			/>
		</div>
	)
}

export const Route = createRoute({
	getParentRoute: () => rootRoute,
	id: '_shell',
	component: AppShell,
	errorComponent: ShellErrorComponent
})
