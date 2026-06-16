import { createAgent, deleteAgent, restoreAgent, updateAgent } from '@/api'
import { toErrorMessage } from '@/lib/errors'
import { agentsQuery, managedAgentQuery } from '@/lib/queries'
import { queryKeys } from '@/lib/queryKeys'
import type { ManagedAgent } from '@/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// Long staleTime: catalog is built at boot and rebuilt on agent writes (which
// invalidate this query), so a session rarely refetches on its own.
export function useAgents() {
	return useQuery(agentsQuery())
}

/** Full editable agent for the cockpit/editor. `null` skips the fetch. */
export function useManagedAgent(name: string | null) {
	const query = useQuery(managedAgentQuery(name))
	return {
		agent: query.data ?? null,
		isLoading: query.isLoading,
		error: toErrorMessage(query.error)
	}
}

/** Create / update / delete a custom agent; each write invalidates the roster. */
export function useAgentMutations() {
	const queryClient = useQueryClient()
	const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.agents.all })

	const create = useMutation({ mutationFn: createAgent, onSuccess: invalidate })
	const update = useMutation({
		mutationFn: ({ name, agent }: { name: string; agent: ManagedAgent }) => updateAgent(name, agent),
		onSuccess: (_data, vars) => {
			void invalidate()
			void queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(vars.name) })
		}
	})
	const remove = useMutation({ mutationFn: deleteAgent, onSuccess: invalidate })
	const restore = useMutation({
		mutationFn: restoreAgent,
		onSuccess: (_data, name) => {
			void invalidate()
			void queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(name) })
		}
	})

	return {
		createAgent: create.mutateAsync,
		updateAgent: update.mutateAsync,
		deleteAgent: remove.mutateAsync,
		restoreAgent: restore.mutateAsync,
		isMutating: create.isPending || update.isPending || remove.isPending || restore.isPending
	}
}
