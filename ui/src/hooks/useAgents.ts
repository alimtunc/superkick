import { agentsQuery } from '@/lib/queries'
import { useQuery } from '@tanstack/react-query'

// Long staleTime: catalog is built at boot from superkick.yaml and rarely changes per session.
export function useAgents() {
	return useQuery(agentsQuery())
}
