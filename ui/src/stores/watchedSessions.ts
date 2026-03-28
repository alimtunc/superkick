import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const MAX_WATCHED = 5

interface WatchedSessionsState {
	ids: string[]
	focusedId: string | null
}

interface WatchedSessionsActions {
	isWatched: (runId: string) => boolean
	watch: (runId: string) => void
	unwatch: (runId: string) => void
	toggleWatch: (runId: string) => void
	focus: (runId: string) => void
	clearFocus: () => void
}

export type WatchedSessionsStore = WatchedSessionsState &
	WatchedSessionsActions & {
		maxReached: boolean
	}

export const useWatchedSessionsStore = create<WatchedSessionsStore>()(
	persist(
		(set, get) => ({
			ids: [],
			focusedId: null,

			get maxReached() {
				return get().ids.length >= MAX_WATCHED
			},

			isWatched: (runId: string) => get().ids.includes(runId),

			watch: (runId: string) =>
				set((s) => {
					if (s.ids.includes(runId)) return s
					const next = [runId, ...s.ids].slice(0, MAX_WATCHED)
					return { ids: next, focusedId: runId }
				}),

			unwatch: (runId: string) =>
				set((s) => ({
					ids: s.ids.filter((id) => id !== runId),
					focusedId: s.focusedId === runId ? null : s.focusedId
				})),

			toggleWatch: (runId: string) =>
				set((s) => {
					if (s.ids.includes(runId)) {
						return {
							ids: s.ids.filter((id) => id !== runId),
							focusedId: s.focusedId === runId ? null : s.focusedId
						}
					}
					const next = [runId, ...s.ids].slice(0, MAX_WATCHED)
					return { ids: next, focusedId: runId }
				}),

			focus: (runId: string) =>
				set((s) => {
					const ids = s.ids.includes(runId) ? s.ids : [runId, ...s.ids].slice(0, MAX_WATCHED)
					return { ids, focusedId: runId }
				}),

			clearFocus: () => set({ focusedId: null })
		}),
		{ name: 'superkick:watched-sessions' }
	)
)
