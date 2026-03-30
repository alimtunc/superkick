import { useCallback, useState } from 'react'

interface LaunchDialogState {
	open: boolean
	instructions: string
}

interface UseLaunchDialogOptions {
	defaultInstructions: string
}

export function useLaunchDialog({ defaultInstructions }: UseLaunchDialogOptions) {
	const [state, setState] = useState<LaunchDialogState>({
		open: false,
		instructions: defaultInstructions
	})

	const openDialog = useCallback(() => {
		setState({
			open: true,
			instructions: defaultInstructions
		})
	}, [defaultInstructions])

	const closeDialog = useCallback(() => {
		setState((prev) => ({ ...prev, open: false }))
	}, [])

	const setInstructions = useCallback((value: string) => {
		setState((prev) => ({ ...prev, instructions: value }))
	}, [])

	return {
		...state,
		openDialog,
		closeDialog,
		setInstructions
	}
}
