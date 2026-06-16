import type { PillTone, PrState } from '@/types'

// GitHub-style colour code: open = green, draft = grey, merged = purple/accent,
// closed = red.
export const prStateTone: Record<PrState, PillTone> = {
	open: 'success',
	draft: 'neutral',
	merged: 'accent',
	closed: 'danger'
}
