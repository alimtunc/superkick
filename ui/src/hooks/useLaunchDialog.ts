import { useCallback, useState } from 'react'

interface LaunchDialogState {
	open: boolean
	instructions: string
	useWorktree: boolean
}

interface UseLaunchDialogOptions {
	defaultInstructions: string
	defaultUseWorktree: boolean
}

export function useLaunchDialog({ defaultInstructions, defaultUseWorktree }: UseLaunchDialogOptions) {
	const [state, setState] = useState<LaunchDialogState>({
		open: false,
		instructions: defaultInstructions,
		useWorktree: defaultUseWorktree
	})

	const openDialog = useCallback(() => {
		setState({
			open: true,
			instructions: defaultInstructions,
			useWorktree: defaultUseWorktree
		})
	}, [defaultInstructions, defaultUseWorktree])

	const closeDialog = () => setState((prev) => ({ ...prev, open: false }))
	const setInstructions = (value: string) => setState((prev) => ({ ...prev, instructions: value }))
	const setUseWorktree = (value: boolean) => setState((prev) => ({ ...prev, useWorktree: value }))

	return {
		...state,
		openDialog,
		closeDialog,
		setInstructions,
		setUseWorktree
	}
}
