import { useCallback, useState } from 'react'

import { useDispatchFromQueue } from '@/hooks/useDispatchFromQueue'
import { useLaunchDialog } from '@/hooks/useLaunchDialog'
import type { LaunchProfile } from '@/types'

interface UseLaunchFromInboxOptions {
	launchProfile: LaunchProfile | null | undefined
}

/**
 * State machine for the Inbox "Ready to Launch" flow: tracks the issue the
 * operator picked, opens the launch dialog seeded with the profile defaults,
 * dispatches on confirm and clears the target on close. Keeps the section
 * component free of dispatch wiring.
 */
export function useLaunchFromInbox({ launchProfile }: UseLaunchFromInboxOptions) {
	const { dispatch, isPending } = useDispatchFromQueue()
	const dialog = useLaunchDialog({
		defaultInstructions: launchProfile?.default_instructions ?? '',
		defaultUseWorktree: launchProfile?.use_worktree ?? true
	})
	const [target, setTarget] = useState<string | null>(null)

	const openFor = useCallback(
		(issueIdentifier: string) => {
			setTarget(issueIdentifier)
			dialog.openDialog()
		},
		[dialog]
	)

	const close = useCallback(() => {
		dialog.closeDialog()
		setTarget(null)
	}, [dialog])

	const confirm = useCallback(() => {
		if (!target) return
		dispatch(target, {
			use_worktree: dialog.useWorktree,
			execution_mode: dialog.executionMode,
			operator_instructions: dialog.instructions || undefined
		})
		close()
	}, [target, dispatch, dialog.useWorktree, dialog.executionMode, dialog.instructions, close])

	return {
		dialog,
		target,
		isPending,
		openFor,
		close,
		confirm
	}
}
