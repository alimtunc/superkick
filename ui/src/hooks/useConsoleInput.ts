import { sendConsoleInput } from '@/api'
import { useMutation } from '@tanstack/react-query'

export function useConsoleInput(runId: string, onSent?: () => void) {
	const mutation = useMutation({
		mutationFn: (message: string) => sendConsoleInput(runId, message),
		onSuccess: () => onSent?.()
	})

	return {
		send: (message: string) => mutation.mutate(message),
		isPending: mutation.isPending,
		error: mutation.error ? mutation.error.message : null
	}
}
