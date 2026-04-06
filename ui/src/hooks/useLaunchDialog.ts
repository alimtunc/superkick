import { useCallback, useState } from 'react'

import type { ExecutionMode } from '@/types'

interface LaunchDialogState {
	open: boolean
	instructions: string
	useWorktree: boolean
	executionMode: ExecutionMode
}

interface UseLaunchDialogOptions {
	defaultInstructions: string
	defaultUseWorktree: boolean
}

export function useLaunchDialog({ defaultInstructions, defaultUseWorktree }: UseLaunchDialogOptions) {
	const [state, setState] = useState<LaunchDialogState>({
		open: false,
		instructions: defaultInstructions,
		useWorktree: defaultUseWorktree,
		executionMode: 'full_auto'
	})

	const openDialog = useCallback(() => {
		setState({
			open: true,
			instructions: defaultInstructions,
			useWorktree: defaultUseWorktree,
			executionMode: 'full_auto'
		})
	}, [defaultInstructions, defaultUseWorktree])

	const closeDialog = () => setState((prev) => ({ ...prev, open: false }))
	const setInstructions = (value: string) => setState((prev) => ({ ...prev, instructions: value }))
	const setUseWorktree = (value: boolean) => setState((prev) => ({ ...prev, useWorktree: value }))
	const setExecutionMode = (value: ExecutionMode) => setState((prev) => ({ ...prev, executionMode: value }))

	return {
		...state,
		openDialog,
		closeDialog,
		setInstructions,
		setUseWorktree,
		setExecutionMode
	}
}
