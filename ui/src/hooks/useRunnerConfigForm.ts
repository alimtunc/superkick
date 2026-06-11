import { useState } from 'react'

import { updateRunnerConfig } from '@/api/config'
import { fetchRuns } from '@/api/runs'
import { TERMINAL_STATES } from '@/lib/constants'
import { isDesktopShell, restartActiveDesktopProject } from '@/lib/desktop'
import { withProjectSwitchOverlay } from '@/lib/desktopProjects'
import { errorMessageOr } from '@/lib/errors'
import { queryKeys } from '@/lib/queryKeys'
import {
	isRunnerFormDirty,
	setupCommandsToText,
	toRunnerConfigUpdate,
	validateRunnerForm
} from '@/lib/runnerConfig'
import type { RunnerConfigResponse } from '@/types'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

const RUNNER_PANE_PATH = '/settings?pane=runner'

interface RestartConfirm {
	activeRuns: number | null
}

export function useRunnerConfigForm(server: RunnerConfigResponse) {
	const queryClient = useQueryClient()
	const [seeded, setSeeded] = useState(server)
	const [worktreePrefix, setWorktreePrefix] = useState(server.worktree_prefix)
	const [baseBranch, setBaseBranch] = useState(server.base_branch)
	const [setupCommandsText, setSetupCommandsText] = useState(() =>
		setupCommandsToText(server.setup_commands)
	)
	const [restartConfirm, setRestartConfirm] = useState<RestartConfirm | null>(null)
	const [restarting, setRestarting] = useState(false)

	const update = toRunnerConfigUpdate(worktreePrefix, baseBranch, setupCommandsText)

	if (seeded !== server) {
		if (!isRunnerFormDirty(seeded, update)) {
			setWorktreePrefix(server.worktree_prefix)
			setBaseBranch(server.base_branch)
			setSetupCommandsText(setupCommandsToText(server.setup_commands))
		}
		setSeeded(server)
	}

	const errors = validateRunnerForm(worktreePrefix, baseBranch)
	const valid = errors.worktreePrefix === null && errors.baseBranch === null
	const dirty = isRunnerFormDirty(server, update)

	const restartDaemon = () =>
		withProjectSwitchOverlay(
			'Restarting daemon…',
			() => restartActiveDesktopProject(RUNNER_PANE_PATH),
			'Failed to restart the daemon'
		)

	const requestRestart = async () => {
		setRestarting(true)
		try {
			const runs = await fetchRuns().catch(() => null)
			const activeRuns =
				runs === null ? null : runs.filter((run) => !TERMINAL_STATES.has(run.state)).length
			if (activeRuns === 0) {
				await restartDaemon()
				return
			}
			setRestartConfirm({ activeRuns })
		} finally {
			setRestarting(false)
		}
	}

	const mutation = useMutation({
		mutationFn: updateRunnerConfig,
		onSuccess: (config) => {
			queryClient.setQueryData(queryKeys.config.runner, config)
			setSeeded(config)
			setWorktreePrefix(config.worktree_prefix)
			setBaseBranch(config.base_branch)
			setSetupCommandsText(setupCommandsToText(config.setup_commands))
			if (!config.requires_restart) {
				toast.success('Saved')
				return
			}
			if (!isDesktopShell()) {
				toast.success('Saved — restart the daemon to apply')
				return
			}
			return requestRestart()
		},
		onError: (error) => {
			toast.error(errorMessageOr(error, 'Failed to save runner config'))
		}
	})

	const confirmRestart = async () => {
		setRestarting(true)
		try {
			await restartDaemon()
		} finally {
			setRestarting(false)
			setRestartConfirm(null)
		}
	}

	return {
		worktreePrefix,
		setWorktreePrefix,
		baseBranch,
		setBaseBranch,
		setupCommandsText,
		setSetupCommandsText,
		errors,
		dirty,
		valid,
		saving: mutation.isPending,
		requiresRestart: server.requires_restart,
		desktop: isDesktopShell(),
		save: () => mutation.mutate(update),
		restartConfirm,
		restarting,
		requestRestart,
		confirmRestart,
		cancelRestart: () => setRestartConfirm(null)
	}
}
