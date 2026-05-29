import { useCallback, useEffect, useState } from 'react'

import { pickDefaultAgent } from '@/components/launch/pickDefaultAgent'
import { useAgents } from '@/hooks/useAgents'
import { useDispatchFromQueue } from '@/hooks/useDispatchFromQueue'
import { useLaunchDialog } from '@/hooks/useLaunchDialog'
import type { Agent, LaunchProfile, LaunchStepKind } from '@/types'

interface UseLaunchFromInboxOptions {
	launchProfile: LaunchProfile | null | undefined
}

type AgentSelection = Record<LaunchStepKind, string | null>

const EMPTY_SELECTION: AgentSelection = { plan: null, implement: null, review: null }

/**
 * State machine for the Inbox "Ready to Launch" flow: tracks the issue the
 * operator picked, opens the launch dialog seeded with the profile defaults
 * (incl. a per-step agent recipe seeded from the catalog), dispatches the
 * chosen agents on confirm and clears the target on close. Keeps the section
 * component free of dispatch wiring.
 */
export function useLaunchFromInbox({ launchProfile }: UseLaunchFromInboxOptions) {
	const { dispatch, isPending } = useDispatchFromQueue()
	const agentsQuery = useAgents()
	const agents: readonly Agent[] = agentsQuery.data ?? []
	const dialog = useLaunchDialog({
		defaultInstructions: launchProfile?.default_instructions ?? '',
		defaultUseWorktree: launchProfile?.use_worktree ?? true
	})
	const [target, setTarget] = useState<string | null>(null)
	const [selection, setSelection] = useState<AgentSelection>(EMPTY_SELECTION)

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
			operator_instructions: dialog.instructions || undefined,
			planner_agent: selection.plan ?? undefined,
			coder_agent: selection.implement ?? undefined,
			reviewer_agent: selection.review ?? undefined
		})
		close()
	}, [target, dispatch, dialog.useWorktree, dialog.executionMode, dialog.instructions, selection, close])

	return {
		dialog,
		target,
		isPending,
		agents,
		agentsLoading: agentsQuery.isLoading,
		selection,
		setAgent,
		openFor,
		close,
		confirm
	}
}
