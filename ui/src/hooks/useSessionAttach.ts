import { useState, useCallback } from 'react'

import { prepareSessionAttach } from '@/api'
import type { AttachPayload } from '@/types'
import { useMutation } from '@tanstack/react-query'

export function useSessionAttach() {
	const [payload, setPayload] = useState<AttachPayload | null>(null)

	const mutation = useMutation({
		mutationFn: ({ runId, sessionId }: { runId: string; sessionId: string }) =>
			prepareSessionAttach(runId, sessionId),
		onSuccess: (data) => setPayload(data)
	})

	const attach = useCallback(
		(runId: string, sessionId: string) => {
			mutation.mutate({ runId, sessionId })
		},
		[mutation]
	)

	const reset = useCallback(() => {
		setPayload(null)
		mutation.reset()
	}, [mutation])

	return {
		attach,
		payload,
		isPending: mutation.isPending,
		error: mutation.error ? String(mutation.error) : null,
		reset
	}
}
