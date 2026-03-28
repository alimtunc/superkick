import { ErrorBoundary } from '@/components/ErrorBoundary'
import { router } from '@/router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 10_000,
			retry: 1
		}
	}
})

export function App() {
	return (
		<ErrorBoundary>
			<QueryClientProvider client={queryClient}>
				<RouterProvider router={router} />
			</QueryClientProvider>
		</ErrorBoundary>
	)
}
