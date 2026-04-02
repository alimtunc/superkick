import { useState } from 'react'

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

	const reset = () => {
		setPayload(null)
		mutation.reset()
	}

	return {
		attach: (runId: string, sessionId: string) => mutation.mutate({ runId, sessionId }),
		payload,
		isPending: mutation.isPending,
		error: mutation.error ? mutation.error.message : null,
		reset
	}
}
