import { useEventStream } from '@/hooks/useEventStream'
import { useRunDetail, type UseRunDetailReturn } from '@/hooks/useRunDetail'
import type { RunEvent } from '@/types'

export type UseRunSessionReturn = UseRunDetailReturn & { events: RunEvent[] }

// One call = the run-detail query plus its live event stream (backfill + SSE).
export function useRunSession(runId: string): UseRunSessionReturn {
	const detail = useRunDetail(runId)
	const { events } = useEventStream(runId, detail.syncRun)
	return { ...detail, events }
}
