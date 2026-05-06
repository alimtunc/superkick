import { create } from 'zustand'

interface WorkspaceChatState {
	open: boolean
}

interface WorkspaceChatActions {
	openChat: () => void
	closeChat: () => void
	toggleChat: () => void
}

export const useWorkspaceChatStore = create<WorkspaceChatState & WorkspaceChatActions>((set) => ({
	open: false,
	openChat: () => set({ open: true }),
	closeChat: () => set({ open: false }),
	toggleChat: () => set((s) => ({ open: !s.open }))
}))
