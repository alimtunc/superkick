import { prepareSessionAttach } from '@/api'
import { useMutation } from '@tanstack/react-query'

export function useSessionAttach() {
	const mutation = useMutation({
		mutationFn: ({ runId, sessionId }: { runId: string; sessionId: string }) =>
			prepareSessionAttach(runId, sessionId)
	})

	return {
		attach: (runId: string, sessionId: string) => mutation.mutate({ runId, sessionId }),
		payload: mutation.data ?? null,
		isPending: mutation.isPending,
		error: mutation.error ? mutation.error.message : null,
		reset: () => mutation.reset()
	}
}
