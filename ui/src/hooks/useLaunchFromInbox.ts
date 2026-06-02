import { useCallback, useEffect, useState } from 'react'

import { DuplicateRunError } from '@/api'
import { pickDefaultAgent } from '@/components/launch/pickDefaultAgent'
import { useAgents } from '@/hooks/useAgents'
import { useCreateLaunchTask } from '@/hooks/useCreateLaunchTask'
import { useLaunchDialog } from '@/hooks/useLaunchDialog'
import type { Agent, LaunchProfile, LaunchStepKind } from '@/types'
import { toast } from 'sonner'

interface UseLaunchFromInboxOptions {
	launchProfile: LaunchProfile | null | undefined
}

type AgentSelection = Record<LaunchStepKind, string | null>

const EMPTY_SELECTION: AgentSelection = { plan: null, implement: null, review: null }

/**
 * State machine for the inline "launch the recipe on this issue" flow shared by
 * the Inbox "Ready to Launch" rows and the Issue Detail execution card: tracks
 * the issue the operator picked, opens the launch dialog seeded with the
 * profile defaults (incl. a per-step agent recipe seeded from the catalog),
 * creates a Launch Task on confirm and clears the target on close. Creating a
 * Launch Task (rather than dispatching a bare run) is what lets the Issue
 * Detail execution panel flip from launcher to active-task view in place.
 */
export function useLaunchFromInbox({ launchProfile }: UseLaunchFromInboxOptions) {
	const agentsQuery = useAgents()
	const agents: readonly Agent[] = agentsQuery.data ?? []
	const dialog = useLaunchDialog({ defaultUseWorktree: launchProfile?.use_worktree ?? true })
	const [target, setTarget] = useState<string | null>(null)
	const [targetId, setTargetId] = useState<string | null>(null)
	const [selection, setSelection] = useState<AgentSelection>(EMPTY_SELECTION)
	const createLaunchTask = useCreateLaunchTask({
		issueIdentifier: target ?? '',
		issueId: targetId ?? undefined
	})

	// Seed each step with the catalog's recommended default once agents load,
	// keeping any agent the operator already picked (that still exists).
	useEffect(() => {
		const data = agentsQuery.data
		if (!data || data.length === 0) return
		setSelection((current) => {
			const keep = (name: string | null) =>
				name !== null && data.some((a) => a.name === name) ? name : null
			return {
				plan: keep(current.plan) ?? pickDefaultAgent(data, 'plan')?.name ?? null,
				implement: keep(current.implement) ?? pickDefaultAgent(data, 'implement')?.name ?? null,
				review: keep(current.review) ?? pickDefaultAgent(data, 'review')?.name ?? null
			}
		})
	}, [agentsQuery.data])

	const setAgent = useCallback((kind: LaunchStepKind, name: string) => {
		setSelection((current) => ({ ...current, [kind]: name }))
	}, [])

	const openFor = useCallback(
		(issueIdentifier: string, issueId?: string) => {
			setTarget(issueIdentifier)
			setTargetId(issueId ?? null)
			dialog.openDialog()
		},
		[dialog]
	)

	const close = useCallback(() => {
		dialog.closeDialog()
		setTarget(null)
		setTargetId(null)
	}, [dialog])

	const canLaunch = selection.plan !== null && selection.implement !== null && selection.review !== null

	const confirm = useCallback(() => {
		if (!target || !selection.plan || !selection.implement || !selection.review) return
		createLaunchTask.mutate(
			{
				linear_issue_id: target,
				planner_agent: selection.plan,
				coder_agent: selection.implement,
				reviewer_agent: selection.review,
				use_worktree: dialog.useWorktree
			},
			{
				onSuccess: (result) => {
					toast.success(`Launched ${result.task.linear_issue_id}`)
					close()
				},
				onError: (err) => {
					if (err instanceof DuplicateRunError) {
						toast.error('Run already active', {
							description: `${target} already has a live run (${err.activeRunState}).`
						})
						return
					}
					toast.error('Launch failed', { description: err.message })
				}
			}
		)
	}, [target, createLaunchTask, selection, dialog.useWorktree, close])

	return {
		dialog,
		target,
		isPending: createLaunchTask.isPending,
		agents,
		agentsLoading: agentsQuery.isLoading,
		selection,
		canLaunch,
		setAgent,
		openFor,
		close,
		confirm
	}
}
