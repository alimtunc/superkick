export type NarrativeTone = 'active' | 'attention' | 'success' | 'failure' | 'idle'

export interface RunNarrative {
	phase: string
	headline: string
	nextHint: string
	tone: NarrativeTone
}
