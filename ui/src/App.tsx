import { useState } from 'react'

import { ErrorBoundary } from '@/components/ErrorBoundary'
import { WorkspaceEventsProvider } from '@/lib/workspaceEvents'
import { createAppRouter } from '@/routes'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'

export function App() {
	const [queryClient] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: {
						staleTime: 10_000,
						retry: 1
					}
				}
			})
	)
	const [router] = useState(() => createAppRouter(queryClient))

	return (
		<ErrorBoundary>
			<QueryClientProvider client={queryClient}>
				<WorkspaceEventsProvider>
					<RouterProvider router={router} />
				</WorkspaceEventsProvider>
			</QueryClientProvider>
		</ErrorBoundary>
	)
}
