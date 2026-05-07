import { agentsQuery } from '@/lib/queries'
import { useQuery } from '@tanstack/react-query'

/**
 * SUP-117 — read the project agent catalog. Long staleTime by default since
 * the catalog is built from `superkick.yaml` at server boot and almost never
 * changes inside a session.
 */
export function useAgents() {
	return useQuery(agentsQuery())
}
