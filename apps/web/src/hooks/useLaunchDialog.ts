import { useCallback, useState } from 'react'

interface LaunchDialogState {
	open: boolean
	useWorktree: boolean
}

interface UseLaunchDialogOptions {
	defaultUseWorktree: boolean
}

export function useLaunchDialog({ defaultUseWorktree }: UseLaunchDialogOptions) {
	const [state, setState] = useState<LaunchDialogState>({
		open: false,
		useWorktree: defaultUseWorktree
	})

	const openDialog = useCallback(() => {
		setState({ open: true, useWorktree: defaultUseWorktree })
	}, [defaultUseWorktree])

	const closeDialog = () => setState((prev) => ({ ...prev, open: false }))
	const setUseWorktree = (value: boolean) => setState((prev) => ({ ...prev, useWorktree: value }))

	return {
		...state,
		openDialog,
		closeDialog,
		setUseWorktree
	}
}
